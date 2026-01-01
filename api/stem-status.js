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

        if (data.code === 200 && data.data) {
            const status = data.data.status;
            
            // KIE'den gelen veriyi paylaştığın logdaki hatalı keyleri de kapsayacak şekilde yakala
            const rawInfo = data.data.response?.vocal_separation_info || data.data.vocal_separation_info || data.data.response || {};
            
            // Yazım hatalarını normalize et (instrumentalI_url ve vocal_ur gibi)
            const normalizedStems = {
                vocal_url: rawInfo.vocal_url || rawInfo.vocal_ur || rawInfo["vocal_ur!"],
                instrumental_url: rawInfo.instrumental_url || rawInfo.instrumentalI_url || rawInfo.instrumental_ur,
                drums_url: rawInfo.drums_url,
                bass_url: rawInfo.bass_url,
                guitar_url: rawInfo.guitar_url,
                piano_url: rawInfo.piano_url,
                other_url: rawInfo.other_url,
                backing_vocals_url: rawInfo.backing_vocals_url
            };

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
