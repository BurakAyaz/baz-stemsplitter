// api/list-images.js - MongoDB visuals dizisinden görselleri listele
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token gerekli' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = decodeToken(token);
        
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Geçersiz token' });
        }
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        
        // Kullanıcıyı bul ve sadece 'visuals' alanını getir
        const user = await usersCollection.findOne(
            { wixUserId: decoded.userId },
            { projection: { visuals: 1 } }
        );
        
        // Eğer visuals bölümü henüz yoksa boş dizi döndür
        let visualsList = (user && Array.isArray(user.visuals)) ? user.visuals : [];
        
        // Eğer visuals boşsa eski sistemde kayıtlara bak (geriye dönük uyumluluk)
        if (visualsList.length === 0) {
            const imagesCollection = db.collection('cover_images');
            const oldImages = await imagesCollection
                .find({ wixUserId: decoded.userId })
                .sort({ createdAt: -1 })
                .limit(50)
                .toArray();
                
            if (oldImages.length > 0) {
                // Eski kayıtları yeni formata dönüştür
                visualsList = oldImages.map(img => ({
                    taskId: img.taskId,
                    imageUrl: img.imageUrl,
                    mode: img.mode || 'COVER',
                    prompt: img.prompt || '',
                    createdAt: img.createdAt
                }));
                
                // Eski kayıtları visuals dizisine taşı (migration)
                if (visualsList.length > 0) {
                    await usersCollection.updateOne(
                        { wixUserId: decoded.userId },
                        { $set: { visuals: visualsList } }
                    );
                    console.log(`Migration: ${visualsList.length} görsel visuals dizisine taşındı`);
                }
            }
        }
        
        // Formatlama (frontend için)
        const formattedImages = visualsList.map(img => ({
            taskId: img.taskId,
            url: img.imageUrl || img.url, // Her iki format da desteklenir
            mode: img.mode || 'COVER',
            prompt: img.prompt || '',
            timestamp: img.createdAt ? new Date(img.createdAt).getTime() : Date.now()
        }));
        
        console.log(`📋 ${decoded.userId} için ${formattedImages.length} görsel listelendi`);
        
        return res.status(200).json({
            success: true,
            images: formattedImages,
            count: formattedImages.length
        });
        
    } catch (error) {
        console.error('List visuals error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
