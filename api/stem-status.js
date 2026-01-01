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
            // Dokümantasyona göre data.data doğrudan sonucu içeriyor
            const rawInfo = data.data.response || data.data.vocal_separation_info || data.data;
            const status = data.data.status;

            // 3 KRİTİK BİLGİYİ TOPLUYORUZ
            const vocalUrl = rawInfo.vocal_url || rawInfo.vocal_ur || rawInfo["vocal_ur!"];
            const instUrl = rawInfo.instrumental_url || rawInfo.instrumentalI_url;
            // API yanıtındaki ID, müzik üretilirken kullanılan orijinal taskId'dir
            const originalTaskId = data.data.taskId || taskId; 

            // İşlem Tamam mı? (SUCCESS durumu ve her iki URL'nin varlığı şart)
            const isActuallyComplete = status === 'SUCCESS' && vocalUrl && instUrl;

            const normalizedStems = {
                taskId: originalTaskId,
                vocal_url: vocalUrl,
                instrumental_url: instUrl,
                type: rawInfo.drums_url ? 'split_stem' : 'separate_vocal'
            };

            if (isActuallyComplete && wixUserId) {
                const { db } = await connectToDatabase();
                
                // Belgenizdeki 'stemHistory' dizisine butaskId daha önce eklendi mi?
                const user = await db.collection('users').findOne({ wixUserId });
                const alreadyExists = user?.stemHistory?.some(h => h.taskId === originalTaskId);

                if (!alreadyExists) {
                    await db.collection('users').updateOne(
                        { wixUserId },
                        { 
                            $push: { 
                                stemHistory: { 
                                    $each: [{
                                        taskId: originalTaskId,
                                        stems: normalizedStems,
                                        createdAt: new Date(),
                                        status: 'success'
                                    }], 
                                    $position: 0 
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
                    taskId: originalTaskId,
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