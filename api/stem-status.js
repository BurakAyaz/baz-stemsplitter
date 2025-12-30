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
        const { taskId, wixUserId } = req.query; 

        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}` }
        });
        const data = await response.json();

        // MongoDB Kayıt Mantığı
        if (data.code === 200 && data.data && data.data.status === 'success' && wixUserId) {
            const { db } = await connectToDatabase();
            
            // Veri yapısını standartlaştırıyoruz
            const stemEntry = {
                taskId: taskId,
                type: data.data.type,
                results: data.data.vocal_separation_info, // Kie.ai'den gelen linkler burada
                createdAt: new Date()
            };

            await db.collection('users').updateOne(
                { wixUserId: wixUserId },
                { 
                    $addToSet: { stems: stemEntry } // push yerine addToSet mükerrer kaydı önler
                }
            );
            console.log(`✅ Stem MongoDB'ye kaydedildi: ${taskId}`);
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
