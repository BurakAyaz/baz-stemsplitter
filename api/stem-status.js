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
    const raw = data.data.response || data.data;
    const info = raw.vocal_separation_info || raw;
    const status = data.data.status;

    // URL'leri yakala
    const vocalUrl = info.vocal_url || info.vocal_ur || info["vocal_ur!"];
    const instUrl = info.instrumental_url || info.instrumentalI_url || info.instrumental_ur;

    // KRİTİK DÜZELTME: Sadece statü SUCCESS ise YETMEZ, URL'lerden en az biri olmalı
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

    if (isActuallyComplete && userId) {
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
            taskId: taskId,
            // Sadece gerçekten bittiyse 'success' dön, yoksa frontend beklemeye devam etsin
            status: isActuallyComplete ? 'success' : 'processing',
            vocal_separation_info: isActuallyComplete ? normalizedStems : null
        }
    });
}
