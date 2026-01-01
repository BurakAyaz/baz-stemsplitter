// api/stem-status.js - Get Vocal Separation Details API Endpoint
// KIE API: GET /api/v1/vocal-removal/record-info
// MongoDB entegrasyonu ile stem sonuçlarını kaydeder

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

// Token decode
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

        // Authorization header'dan da wixUserId alabiliriz
        let userId = wixUserId;
        const authHeader = req.headers.authorization;
        if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = decodeToken(token);
            if (decoded && decoded.userId) {
                userId = decoded.userId;
            }
        }

        console.log(`Stem Status Check - TaskId: ${taskId}, UserId: ${userId}`);

        // Kie.ai API - Get Vocal Separation Details
        const response = await fetch(`https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        console.log('Stem Status API Response:', JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error("Stem Status API Hatası:", data);
            throw new Error(data.msg || data.error || JSON.stringify(data));
        }

        // KIE API Response Format:
        // {
        //   "code": 200,
        //   "msg": "success",
        //   "data": {
        //     "taskId": "xxx",
        //     "status": "SUCCESS" | "PENDING" | "PROCESSING" | "FAILED",
        //     "response": {
        //       "vocal_separation_info": {
        //         "vocal_url": "...",
        //         "instrumental_url": "...",
        //         // veya split_stem için:
        //         // "drums_url", "bass_url", "guitar_url", etc.
        //       }
        //     }
        //   }
        // }

        // Başarılı ve sonuç hazırsa MongoDB'ye kaydet
        if (data.code === 200 && data.data) {
            const status = data.data.status;
            const vocalSepInfo = data.data.response?.vocal_separation_info || data.data.vocal_separation_info;
            
            // Status SUCCESS veya vocal_separation_info varsa tamamlanmış demektir
            const isComplete = status === 'SUCCESS' || (vocalSepInfo && (vocalSepInfo.vocal_url || vocalSepInfo.instrumental_url));
            
            if (isComplete && vocalSepInfo && userId) {
                // MongoDB'ye kaydet
                try {
                    const dbConnection = await connectToDatabase();
                    if (dbConnection) {
                        const { db } = dbConnection;
                        
                        // Aynı taskId ile kayıt var mı kontrol et
                        const existingHistory = await db.collection('users').findOne({
                            wixUserId: userId,
                            'stemHistory.taskId': taskId
                        });
                        
                        if (!existingHistory) {
                            // Yeni stem sonucunu kaydet
                            const stemResult = {
                                taskId: taskId,
                                type: vocalSepInfo.instrumental_url && !vocalSepInfo.drums_url ? 'separate_vocal' : 'split_stem',
                                stems: vocalSepInfo,
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
                                            $slice: 50 // Max 50 kayıt tut
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
                    // DB hatası ana response'u etkilemesin
                }
            }
            
            // Frontend'in beklediği format
            return res.status(200).json({
                code: 200,
                msg: 'success',
                data: {
                    taskId: data.data.taskId || taskId,
                    status: isComplete ? 'success' : (status || 'processing'),
                    vocal_separation_info: vocalSepInfo || null
                }
            });
        }

        // Ham veriyi döndür
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
