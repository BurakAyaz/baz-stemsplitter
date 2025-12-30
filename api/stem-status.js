// api/stem-status.js - GÜNCELLENMİŞ VERSİYON
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
        const { taskId, wixUserId } = req.query; // wixUserId'yi sorguya ekliyoruz

        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}` }
        });
        const data = await response.json();

        // KRİTİK NOKTA: Eğer işlem tamamlandıysa MongoDB'ye kaydet
        if (data.code === 200 && data.data && data.data.status === 'success' && wixUserId) {
            const { db } = await connectToDatabase();
            
            // Bu taskId daha önce kaydedilmiş mi kontrol et (mükerrer kaydı önlemek için)
            const user = await db.collection('users').findOne({ wixUserId: wixUserId });
            const alreadyExists = user.stems?.some(s => s.taskId === taskId);

            if (!alreadyExists) {
                await db.collection('users').updateOne(
                    { wixUserId: wixUserId },
                    { 
                        $push: { 
                            stems: {
                                taskId: taskId,
                                type: data.data.type,
                                results: data.data.vocal_separation_info,
                                createdAt: new Date()
                            } 
                        } 
                    }
                );
            }
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
