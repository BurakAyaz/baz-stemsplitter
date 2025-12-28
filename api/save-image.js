// api/save-image.js - MongoDB visuals dizisine görsel kaydet
const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('bazai');
    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

function decodeToken(token) {
    try {
        const decodedToken = decodeURIComponent(token);
        const jsonString = Buffer.from(decodedToken, 'base64').toString('utf8');
        return JSON.parse(jsonString);
    } catch (e1) {
        try {
            const jsonString = Buffer.from(token, 'base64').toString('utf8');
            return JSON.parse(jsonString);
        } catch (e2) {
            return null;
        }
    }
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token required' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = decodeToken(token);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        const { taskId, imageUrl, mode, prompt } = req.body;
        if (!taskId || !imageUrl) {
            return res.status(400).json({ error: 'taskId ve imageUrl gerekli' });
        }
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        const imagesCollection = db.collection('cover_images');

        // 1. Kullanıcıyı bul
        const user = await usersCollection.findOne({ wixUserId: decoded.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // 2. Visuals dizisi yoksa oluştur
        if (!Array.isArray(user.visuals)) {
            await usersCollection.updateOne(
                { wixUserId: decoded.userId },
                { $set: { visuals: [] } }
            );
            console.log("Visuals dizisi yoktu, yeni oluşturuldu.");
        }

        // 3. Görsel verisini hazırla
        const visualItem = {
            taskId: taskId,
            imageUrl: imageUrl,
            mode: mode || 'COVER',
            prompt: prompt || '',
            createdAt: new Date()
        };

        // 4. Visuals dizisine ekle (en başa)
        const updateResult = await usersCollection.updateOne(
            { wixUserId: decoded.userId },
            { 
                $push: { 
                    visuals: { 
                        $each: [visualItem],
                        $position: 0 // En başa ekle
                    }
                },
                $set: { updatedAt: new Date() }
            }
        );
        
        // 5. Yedek koleksiyona da kaydet (geriye dönük uyumluluk)
        await imagesCollection.updateOne(
            { taskId: taskId },
            { $set: { ...visualItem, wixUserId: decoded.userId } },
            { upsert: true }
        );

        console.log(`✅ Görsel kaydedildi: ${decoded.userId} - Task: ${taskId}`);

        return res.status(200).json({
            success: true,
            message: 'Görsel başarıyla kaydedildi',
            data: {
                taskId: taskId,
                savedToVisuals: updateResult.modifiedCount > 0
            }
        });
        
    } catch (error) {
        console.error('❌ SAVE ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
};
