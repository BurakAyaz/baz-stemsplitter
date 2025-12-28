// api/delete-image.js - MongoDB visuals dizisinden görsel sil
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
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
    
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
        
        const { taskId } = req.query;
        
        if (!taskId) {
            return res.status(400).json({ error: 'taskId gerekli' });
        }
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        const imagesCollection = db.collection('cover_images');
        
        // 1. Visuals dizisinden sil
        const updateResult = await usersCollection.updateOne(
            { wixUserId: decoded.userId },
            { 
                $pull: { visuals: { taskId: taskId } },
                $set: { updatedAt: new Date() }
            }
        );
        
        // 2. Yedek koleksiyondan da sil (geriye dönük uyumluluk)
        const deleteResult = await imagesCollection.deleteOne({
            wixUserId: decoded.userId,
            taskId: taskId
        });
        
        const deleted = updateResult.modifiedCount > 0 || deleteResult.deletedCount > 0;
        
        if (!deleted) {
            return res.status(404).json({ error: 'Görsel bulunamadı' });
        }
        
        console.log(`🗑️ Görsel silindi: ${decoded.userId} - Task: ${taskId}`);
        
        return res.status(200).json({
            success: true,
            message: 'Görsel silindi',
            taskId: taskId,
            deletedFromVisuals: updateResult.modifiedCount > 0,
            deletedFromBackup: deleteResult.deletedCount > 0
        });
        
    } catch (error) {
        console.error('Delete image error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
