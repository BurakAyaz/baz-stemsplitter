// api/stem-status.js - Stem Status Check
// ÖNCE MongoDB'deki callback sonucuna bakar, YOKSA KIE API'yi sorgular

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

    console.log('=== STEM-STATUS CHECK ===');
    console.log('taskId:', taskId);
    console.log('wixUserId:', wixUserId);

    try {
        const { db } = await connectToDatabase();

        // 1. ÖNCE MongoDB stemResults collection'ına bak (callback sonucu)
        console.log('MongoDB stemResults sorgulanıyor...');
        const stemResult = await db.collection('stemResults').findOne({ taskId: taskId });
        
        console.log('MongoDB stemResult:', stemResult ? JSON.stringify(stemResult).substring(0, 200) : 'YOK');
        console.log('stemResult status:', stemResult?.status);
        console.log('stemResult stems:', stemResult?.stems ? 'VAR' : 'YOK');

        if (stemResult && stemResult.status === 'success' && stemResult.stems) {
            console.log('✓ Callback sonucu bulundu!');
            console.log('Vocal URL:', stemResult.stems.vocal_url);
            console.log('Instrumental URL:', stemResult.stems.instrumental_url);

            // Kullanıcının stemHistory'sine kaydet (eğer henüz kaydedilmediyse)
            if (wixUserId) {
                // Önce wixUserId ile, sonra email ile ara
                let userDoc = await db.collection('users').findOne({ wixUserId: wixUserId });
                
                // wixUserId ile bulunamadıysa, stemResult'tan email ile dene
                if (!userDoc && stemResult.email) {
                    userDoc = await db.collection('users').findOne({ email: stemResult.email });
                }
                
                console.log('User found:', userDoc ? 'EVET' : 'HAYIR');
                
                if (userDoc) {
                    const alreadySaved = userDoc?.stemHistory?.some(item => item.taskId === taskId);

                    if (!alreadySaved) {
                        console.log('Kullanıcı stemHistory\'sine kaydediliyor...');
                        
                        const stemEntry = {
                            taskId: taskId,
                            stems: stemResult.stems,
                            type: stemResult.type || 'separate_vocal',
                            stemName: stemResult.stemName || '',
                            createdAt: stemResult.completedAt || new Date()
                        };

                        // Kullanıcıyı wixUserId veya email ile güncelle
                        const userQuery = userDoc.wixUserId ? { wixUserId: userDoc.wixUserId } : { email: userDoc.email };
                        
                        await db.collection('users').updateOne(
                            userQuery,
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
                        console.log('✓ stemHistory güncellendi');
                    }
                } else {
                    console.log('Kullanıcı bulunamadı, stemHistory kaydedilemedi');
                }
            }

            // Başarılı response döndür
            return res.status(200).json({
                code: 200,
                msg: 'success',
                data: {
                    taskId: taskId,
                    status: 'success',
                    stemName: stemResult.stemName || '',
                    vocal_separation_info: stemResult.stems
                }
            });
        }

        // 2. MongoDB'de yoksa veya pending ise, KIE API'yi sorgula
        console.log('MongoDB\'de sonuç yok, KIE API sorgulanıyor...');
        
        const kieUrl = `https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`;
        const response = await fetch(kieUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const kieData = await response.json();
        console.log('KIE API Response:', JSON.stringify(kieData));

        if (kieData.code === 200 && kieData.data) {
            const apiData = kieData.data;
            
            // KIE API yapısı:
            // successFlag: "PENDING" | "SUCCESS" | "FAILED"
            // response: { vocalUrl, instrumentalUrl, ... } (camelCase!)
            const status = apiData.successFlag || apiData.status || 'PENDING';
            const responseData = apiData.response;

            console.log('Parsed status (successFlag):', status);
            console.log('Response data:', responseData ? JSON.stringify(responseData).substring(0, 100) : 'NULL');

            // SUCCESS ve response varsa sonuçları işle
            if ((status === 'SUCCESS' || status === 'success') && responseData) {
                // KIE API camelCase kullanıyor: vocalUrl, instrumentalUrl
                // Biz snake_case'e çeviriyoruz: vocal_url, instrumental_url
                const stems = {
                    id: responseData.id || apiData.musicId || taskId,
                    vocal_url: responseData.vocalUrl || responseData.vocal_url,
                    instrumental_url: responseData.instrumentalUrl || responseData.instrumental_url,
                    drums_url: responseData.drumsUrl || responseData.drums_url || null,
                    bass_url: responseData.bassUrl || responseData.bass_url || null,
                    guitar_url: responseData.guitarUrl || responseData.guitar_url || null,
                    keyboard_url: responseData.keyboardUrl || responseData.keyboard_url || null,
                    strings_url: responseData.stringsUrl || responseData.strings_url || null,
                    brass_url: responseData.brassUrl || responseData.brass_url || null,
                    woodwinds_url: responseData.woodwindsUrl || responseData.woodwinds_url || null,
                    percussion_url: responseData.percussionUrl || responseData.percussion_url || null,
                    synth_url: responseData.synthUrl || responseData.synth_url || null,
                    fx_url: responseData.fxUrl || responseData.fx_url || null,
                    backing_vocals_url: responseData.backingVocalsUrl || responseData.backing_vocals_url || null
                };
                
                console.log('Stems parsed - vocal:', stems.vocal_url);
                console.log('Stems parsed - instrumental:', stems.instrumental_url);

                // MongoDB'ye kaydet
                await db.collection('stemResults').updateOne(
                    { taskId: taskId },
                    {
                        $set: {
                            status: 'success',
                            stems: stems,
                            type: stems.drums_url ? 'split_stem' : 'separate_vocal',
                            completedAt: new Date()
                        }
                    },
                    { upsert: true }
                );

                // Kullanıcı stemHistory'sine kaydet
                if (wixUserId) {
                    const userDoc = await db.collection('users').findOne({ wixUserId: wixUserId });
                    const alreadySaved = userDoc?.stemHistory?.some(item => item.taskId === taskId);

                    if (!alreadySaved) {
                        await db.collection('users').updateOne(
                            { wixUserId: wixUserId },
                            {
                                $push: {
                                    stemHistory: {
                                        $each: [{
                                            taskId: taskId,
                                            stems: stems,
                                            type: stems.drums_url ? 'split_stem' : 'separate_vocal',
                                            createdAt: new Date()
                                        }],
                                        $position: 0,
                                        $slice: 50
                                    }
                                },
                                $set: { updatedAt: new Date() }
                            }
                        );
                    }
                }

                return res.status(200).json({
                    code: 200,
                    msg: 'success',
                    data: {
                        taskId: taskId,
                        status: 'success',
                        vocal_separation_info: stems
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

        // KIE API'den de sonuç yok
        return res.status(200).json({
            code: 200,
            msg: 'processing',
            data: {
                taskId: taskId,
                status: 'processing',
                vocal_separation_info: null
            }
        });

    } catch (error) {
        console.error('Stem status error:', error);
        return res.status(500).json({
            code: 500,
            error: error.message
        });
    }
};
