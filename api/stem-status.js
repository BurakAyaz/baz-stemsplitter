// api/stem-status.js
const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('bazai');
    cachedClient = client; cachedDb = db;
    return { client, db };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { taskId, wixUserId } = req.query;
        if (!taskId) return res.status(400).json({ error: 'taskId gerekli' });

        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.code === 200 && data.data) {
            const raw = data.data.response || data.data;
            const info = raw.vocal_separation_info || raw;
            const status = data.data.status;

            // KIE'den gelen hatalı URL anahtarlarını standartlaştır
            const vocalUrl = info.vocal_url || info.vocal_ur || info["vocal_ur!"];
            const instUrl = info.instrumental_url || info.instrumentalI_url || info.instrumental_ur;

            // KRİTİK: İşlem gerçekten bitti mi kontrolü
            const hasUrls = !!(vocalUrl || instUrl);
            const isActuallyComplete = status === 'SUCCESS' && hasUrls;

            const normalizedStems = {
                vocal_url: vocalUrl || null,
                instrumental_url: instUrl || null,
                drums_url: info.drums_url || null,
                bass_url: info.bass_url || null,
                guitar_url: info.guitar_url || null,
                piano_url: info.piano_url || null,
                other_url: info.other_url || null
            };

            // MongoDB'ye "stems" bölümü olarak kaydet
            if (isActuallyComplete && wixUserId) {
                const { db } = await connectToDatabase();
                
                // Bu taskId daha önce stemHistory dizisine eklenmiş mi kontrol et
                const userDoc = await db.collection('users').findOne({ wixUserId: wixUserId });
                const isAlreadySaved = userDoc?.stemHistory?.some(item => item.taskId === taskId);

                if (!isAlreadySaved) {
                    const stemEntry = {
                        taskId: taskId,
                        type: normalizedStems.drums_url ? 'split_stem' : 'separate_vocal',
                        stems: normalizedStems, // İstenen "stems" yapısı
                        createdAt: new Date()
                    };
                    
                    await db.collection('users').updateOne(
                        { wixUserId: wixUserId },
                        { 
                            $push: { 
                                stemHistory: { $each: [stemEntry], $position: 0, $slice: 50 } 
                            },
                            $set: { updatedAt: new Date() }
                        }
                    );
                    console.log(`StemHistory kaydedildi: ${taskId}`);
                }
            }

            return res.status(200).json({
                code: 200,
                msg: 'success',
                data: {
                    taskId: taskId,
                    status: isActuallyComplete ? 'success' : 'processing',
                    vocal_separation_info: isActuallyComplete ? normalizedStems : null
                }
            });
        }
        return res.status(200).json(data);
    } catch (error) {
        console.error("Backend Hatası:", error);
        return res.status(500).json({ error: error.message });
    }
};