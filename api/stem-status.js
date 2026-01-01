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
            const raw = data.data.response || data.data.vocal_separation_info || data.data;
            const status = data.data.status;

            // Logdaki 3 kritik veriyi normalize ediyoruz
            const vocalUrl = raw.vocal_url || raw.vocal_ur || raw["vocal_ur!"];
            const instUrl = raw.instrumental_url || raw.instrumentalI_url;
            const musicId = raw.musicId || raw.id || taskId; 

            // İşlem gerçekten bitti mi? (SUCCESS statüsü VE URL'lerin varlığı)
            const isActuallyComplete = status === 'SUCCESS' && vocalUrl && instUrl;

            // Tek bir üründe toplanan ana veri yapısı
            const normalizedStems = {
                musicId: musicId,
                vocal_url: vocalUrl,
                instrumental_url: instUrl,
                drums_url: raw.drums_url || null,
                bass_url: raw.bass_url || null,
                type: raw.drums_url ? 'split_stem' : 'separate_vocal'
            };

            // MongoDB Kayıt Mantığı
            if (isActuallyComplete && wixUserId) {
                const { db } = await connectToDatabase();
                
                // Mükerrer kaydı taskId üzerinden kontrol et
                const userDoc = await db.collection('users').findOne({ wixUserId: wixUserId });
                const alreadySaved = userDoc?.stemHistory?.some(item => item.taskId === taskId);

                if (!alreadySaved) {
                    const stemEntry = {
                        taskId: taskId, 
                        musicId: musicId, 
                        stems: normalizedStems, // Tek ürün birleştirildi
                        createdAt: new Date(),
                        type: normalizedStems.type
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
        return res.status(500).json({ error: error.message });
    }
};