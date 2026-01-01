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
            const rawInfo = data.data.response || data.data.vocal_separation_info || data.data;
            const status = data.data.status;

            // KIE'den gelen 3 kritik veriyi yakala
            const vocalUrl = rawInfo.vocal_url || rawInfo.vocal_ur || rawInfo["vocal_ur!"];
            const instUrl = rawInfo.instrumental_url || rawInfo.instrumentalI_url;
            const kieId = rawInfo.id || taskId; 

            // KRİTİK: URL'ler hazır değilse işlem bitmiş sayılmaz
            const isActuallyComplete = status === 'SUCCESS' && vocalUrl && instUrl;

            const normalizedStems = {
                id: kieId,
                vocal_url: vocalUrl,
                instrumental_url: instUrl,
                drums_url: rawInfo.drums_url || null,
                bass_url: rawInfo.bass_url || null,
                guitar_url: rawInfo.guitar_url || null
            };

            // MongoDB'ye "tek bir ürün" olarak kayıt
            if (isActuallyComplete && wixUserId) {
                const { db } = await connectToDatabase();
                
                // Sorgulanan taskId üzerinden kontrol et
                const existing = await db.collection('users').findOne({ 
                    wixUserId: wixUserId, 
                    'stemHistory.taskId': taskId 
                });

                if (!existing) {
                    const stemEntry = {
                        taskId: taskId, // Polling yapılan ID
                        kieId: kieId,   // API'den dönen dosya ID'si
                        type: rawInfo.drums_url ? 'split_stem' : 'separate_vocal',
                        stems: normalizedStems, // 3 veri tek üründe toplandı
                        createdAt: new Date()
                    };
                    
                    await db.collection('users').updateOne(
                        { wixUserId: wixUserId },
                        { 
                            $push: { stemHistory: { $each: [stemEntry], $position: 0, $slice: 50 } },
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