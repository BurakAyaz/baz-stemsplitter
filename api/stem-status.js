// api/stem-status.js - Get Vocal Separation Details
// KIE API endpoint: GET /api/v1/vocal-removal/record-info?taskId=xxx

const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('bazai');
    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { taskId, wixUserId } = req.query;
    if (!taskId) return res.status(400).json({ error: 'taskId gerekli' });

    console.log('=== STEM-STATUS API CALLED ===');
    console.log('taskId:', taskId);
    console.log('wixUserId:', wixUserId);

    try {
        // KIE API'yi çağır
        const kieUrl = `https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`;
        console.log('KIE API URL:', kieUrl);
        
        const response = await fetch(kieUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const rawData = await response.json();
        console.log('KIE API RAW Response:', JSON.stringify(rawData, null, 2));

        // KIE API Response Formatı (record-info endpoint):
        // {
        //   "code": 200,
        //   "msg": "success",
        //   "data": {
        //     "taskId": "xxx",
        //     "status": "SUCCESS" | "PENDING" | "PROCESSING",
        //     "response": {
        //       "id": "xxx",
        //       "instrumental_url": "https://...",
        //       "vocal_url": "https://..."
        //     }
        //   }
        // }

        if (rawData.code === 200 && rawData.data) {
            const taskData = rawData.data;
            const status = taskData.status;
            
            // Response içindeki vocal separation bilgisi
            // Bazen "response" içinde, bazen doğrudan "data" içinde olabilir
            let stemInfo = null;
            
            // Önce response içinde ara
            if (taskData.response) {
                stemInfo = taskData.response;
            }
            // Yoksa doğrudan data içinde ara
            else if (taskData.vocal_url || taskData.instrumental_url) {
                stemInfo = taskData;
            }
            
            console.log('Status:', status);
            console.log('Stem Info:', stemInfo ? JSON.stringify(stemInfo) : 'YOK');

            // URL'lerin varlığını kontrol et
            const hasVocal = stemInfo && stemInfo.vocal_url;
            const hasInstrumental = stemInfo && stemInfo.instrumental_url;
            
            // İşlem tamamlandı mı?
            const isComplete = (status === 'SUCCESS' || status === 'success') && hasVocal && hasInstrumental;
            
            console.log('Is Complete:', isComplete, '| hasVocal:', hasVocal, '| hasInstrumental:', hasInstrumental);

            if (isComplete) {
                // Normalize edilmiş stem bilgisi
                const normalizedStems = {
                    id: stemInfo.id || taskId,
                    vocal_url: stemInfo.vocal_url,
                    instrumental_url: stemInfo.instrumental_url,
                    // Ek stemler (split_stem için)
                    drums_url: stemInfo.drums_url || null,
                    bass_url: stemInfo.bass_url || null,
                    guitar_url: stemInfo.guitar_url || null,
                    keyboard_url: stemInfo.keyboard_url || null,
                    strings_url: stemInfo.strings_url || null,
                    brass_url: stemInfo.brass_url || null,
                    woodwinds_url: stemInfo.woodwinds_url || null,
                    percussion_url: stemInfo.percussion_url || null,
                    synth_url: stemInfo.synth_url || null,
                    fx_url: stemInfo.fx_url || null,
                    backing_vocals_url: stemInfo.backing_vocals_url || null
                };

                // MongoDB'ye kaydet
                if (wixUserId) {
                    try {
                        const { db } = await connectToDatabase();
                        
                        // Mükerrer kayıt kontrolü
                        const userDoc = await db.collection('users').findOne({ wixUserId: wixUserId });
                        const alreadySaved = userDoc?.stemHistory?.some(item => item.taskId === taskId);

                        if (!alreadySaved) {
                            console.log('MongoDB\'ye kaydediliyor...');
                            const stemEntry = {
                                taskId: taskId,
                                musicId: normalizedStems.id,
                                stems: normalizedStems,
                                type: normalizedStems.drums_url ? 'split_stem' : 'separate_vocal',
                                createdAt: new Date()
                            };

                            await db.collection('users').updateOne(
                                { wixUserId: wixUserId },
                                {
                                    $push: {
                                        stemHistory: {
                                            $each: [stemEntry],
                                            $position: 0,
                                            $slice: 50
                                        }
                                    },
                                    $set: { updatedAt: new Date() }
                                }
                            );
                            console.log('MongoDB kayıt başarılı');
                        } else {
                            console.log('Bu taskId zaten kaydedilmiş, atlanıyor');
                        }
                    } catch (dbError) {
                        console.error('MongoDB hatası:', dbError);
                    }
                }

                // Başarılı response döndür
                return res.status(200).json({
                    code: 200,
                    msg: 'success',
                    data: {
                        taskId: taskId,
                        status: 'success',
                        vocal_separation_info: normalizedStems
                    }
                });
            }

            // Henüz tamamlanmadı
            return res.status(200).json({
                code: 200,
                msg: 'processing',
                data: {
                    taskId: taskId,
                    status: status ? status.toLowerCase() : 'processing',
                    vocal_separation_info: null
                }
            });
        }

        // Hata durumu
        console.log('KIE API error response:', rawData);
        return res.status(200).json({
            code: rawData.code || 500,
            msg: rawData.msg || 'error',
            data: rawData.data || null
        });

    } catch (error) {
        console.error('Stem status error:', error);
        return res.status(500).json({
            code: 500,
            error: error.message
        });
    }
};
