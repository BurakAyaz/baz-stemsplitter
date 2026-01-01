// api/stem-status.js - MongoDB ve Normalize Düzenlemesi
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
    // ... CORS ve Key Kontrolleri aynı kalacak
    
    try {
        const { taskId, wixUserId } = req.query; // wixUserId'yi query'den alıyoruz

        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.code === 200 && data.data) {
            const info = data.data.vocal_separation_info || data.data.response || {};
            
            // 1. Yazım hatalarını temizle ve "stems" objesini oluştur
            const normalizedStems = {
                vocal_url: info.vocal_url || info.vocal_ur || info["vocal_ur!"],
                instrumental_url: info.instrumental_url || info.instrumentalI_url || info.instrumental_ur,
                drums_url: info.drums_url,
                bass_url: info.bass_url,
                guitar_url: info.guitar_url,
                piano_url: info.piano_url,
                other_url: info.other_url
            };

            const isComplete = data.data.status === 'SUCCESS' || (normalizedStems.vocal_url || normalizedStems.instrumental_url);

            // 2. MongoDB'ye "stems" bölümü açarak kaydet
            if (isComplete && wixUserId) {
                const { db } = await connectToDatabase();
                const existing = await db.collection('users').findOne({ wixUserId, 'stemHistory.taskId': taskId });
                
                if (!existing) {
                    const stemEntry = {
                        taskId,
                        type: normalizedStems.drums_url ? 'split_stem' : 'separate_vocal',
                        stems: normalizedStems, // İstenen "stems" bölümü
                        createdAt: new Date()
                    };
                    await db.collection('users').updateOne(
                        { wixUserId },
                        { $push: { stemHistory: { $each: [stemEntry], $position: 0, $slice: 50 } } }
                    );
                }
            }

            return res.status(200).json({
                code: 200,
                msg: 'success',
                data: {
                    taskId,
                    status: isComplete ? 'success' : 'processing',
                    vocal_separation_info: normalizedStems // Frontend'in beklediği temiz veri
                }
            });
        }
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};