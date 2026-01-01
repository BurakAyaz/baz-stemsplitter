// api/stem-status.js - Get Vocal Separation Details API Endpoint
const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    
    const uri = process.env.MONGODB_URI;
    if (!uri) return null;
    
    try {
        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db('bazai');
        
        cachedClient = client;
        cachedDb = db;
        
        return { client, db };
    } catch (e) {
        console.error('MongoDB connection error:', e);
        return null;
    }
}

function decodeToken(token) {
    try {
        let decoded = token;
        if (token.includes('%')) {
            decoded = decodeURIComponent(token);
        }
        const json = Buffer.from(decoded, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Sadece GET isteği kabul edilir.' });
    }

    if (!process.env.KIE_API_KEY) {
        return res.status(500).json({ error: 'Sunucu hatası: API Key eksik.' });
    }

    try {
        const { taskId, wixUserId } = req.query;

        if (!taskId) {
            return res.status(400).json({ error: 'taskId parametresi gerekli.' });
        }

        let userId = wixUserId;
        const authHeader = req.headers.authorization;
        if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = decodeToken(token);
            if (decoded && decoded.userId) {
                userId = decoded.userId;
            }
        }

        // KIE API - Vocal Separation Details
        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Stem Status API Hatası:", data);
            throw new Error(data.msg || data.error || JSON.stringify(data));
        }

       // api/stem-status.js içindeki veri yakalama mantığı:
if (data.code === 200 && data.data) {
    // API bazen 'response' içinde bazen doğrudan 'data' içinde gönderiyor
    const raw = data.data.response || data.data;
    const info = raw.vocal_separation_info || raw;

    // Yazım hatalarını ve alternatif anahtarları normalize et
    const normalizedStems = {
        vocal_url: info.vocal_url || info.vocal_ur || info["vocal_ur!"],
        instrumental_url: info.instrumental_url || info.instrumentalI_url || info.instrumental_ur,
        drums_url: info.drums_url,
        bass_url: info.bass_url,
        guitar_url: info.guitar_url,
        piano_url: info.piano_url || info.keyboard_url,
        other_url: info.other_url || info.synth_url
    };

    // MongoDB'ye "stems" altında kaydet
    const stemResult = {
        taskId: taskId,
        stems: normalizedStems,
        status: data.data.status === 'SUCCESS' ? 'success' : 'processing',
        createdAt: new Date()
    };
    // ... MongoDB kayıt işlemleri ...
}
            const isComplete = status === 'SUCCESS' || (normalizedStems.vocal_url || normalizedStems.instrumental_url);
            
            if (isComplete && userId) {
                try {
                    const dbConnection = await connectToDatabase();
                    if (dbConnection) {
                        const { db } = dbConnection;
                        
                        const existingHistory = await db.collection('users').findOne({
                            wixUserId: userId,
                            'stemHistory.taskId': taskId
                        });
                        
                        if (!existingHistory) {
                            // "stems" bölümü altında temiz veriyi kaydet
                            const stemResult = {
                                taskId: taskId,
                                type: normalizedStems.drums_url ? 'split_stem' : 'separate_vocal',
                                stems: normalizedStems, 
                                status: 'success',
                                createdAt: new Date()
                            };
                            
                            await db.collection('users').updateOne(
                                { wixUserId: userId },
                                {
                                    $push: {
                                        stemHistory: {
                                            $each: [stemResult],
                                            $position: 0,
                                            $slice: 50 
                                        }
                                    },
                                    $set: { updatedAt: new Date() }
                                }
                            );
                            console.log(`Stem result saved to MongoDB for user: ${userId}`);
                        }
                    }
                } catch (dbError) {
                    console.error('MongoDB save error:', dbError);
                }
            }
            
            return res.status(200).json({
                code: 200,
                msg: 'success',
                data: {
                    taskId: taskId,
                    status: isComplete ? 'success' : (status || 'processing'),
                    vocal_separation_info: normalizedStems // Normalize edilmiş veri gidiyor
                }
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Stem Status Proxy Hatası:", error);
        return res.status(500).json({ 
            code: 500,
            error: 'Durum sorgulanamadı', 
            details: error.message 
        });
    }
};
