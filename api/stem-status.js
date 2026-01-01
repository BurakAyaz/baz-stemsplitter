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

function decodeToken(token) {
    try {
        let decoded = token;
        if (token.includes('%')) decoded = decodeURIComponent(token);
        return JSON.parse(Buffer.from(decoded, 'base64').toString('utf8'));
    } catch (e) { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { taskId, wixUserId } = req.query;
        let userId = wixUserId;
        const authHeader = req.headers.authorization;
        if (!userId && authHeader?.startsWith('Bearer ')) {
            const decoded = decodeToken(authHeader.substring(7));
            if (decoded) userId = decoded.userId;
        }

        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.code === 200 && data.data) {
            const raw = data.data.response || data.data;
            const info = raw.vocal_separation_info || raw;
            const status = data.data.status;

            const vocalUrl = info.vocal_url || info.vocal_ur || info["vocal_ur!"];
            const instUrl = info.instrumental_url || info.instrumentalI_url || info.instrumental_ur;

            // KRİTİK DÜZELTME: Sadece SUCCESS yetmez, URL'ler de gelmiş olmalı
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
                const { db } = await connectToDatabase();
                const existing = await db.collection('users').findOne({ wixUserId: userId, 'stemHistory.taskId': taskId });
                if (!existing) {
                    const stemEntry = {
                        taskId,
                        type: normalizedStems.drums_url ? 'split_stem' : 'separate_vocal',
                        stems: normalizedStems, // MongoDB "stems" bölümü
                        createdAt: new Date()
                    };
                    await db.collection('users').updateOne(
                        { wixUserId: userId },
                        { $push: { stemHistory: { $each: [stemEntry], $position: 0, $slice: 50 } } }
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
