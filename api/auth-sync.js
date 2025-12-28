// api/auth-sync.js - Kullanıcı Auth Senkronizasyonu (BAZ AI Music Login'den alındı)
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

// Kalan gün hesapla
function getDaysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Token kontrolü
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token gerekli' });
    }
    
    const token = authHeader.substring(7);
    const decoded = decodeToken(token);
    
    if (!decoded || !decoded.userId) {
        return res.status(401).json({ error: 'Geçersiz token' });
    }
    
    try {
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        
        // Kullanıcıyı bul
        let user = await usersCollection.findOne({ wixUserId: decoded.userId });
        
        // Kullanıcı yoksa oluştur
        if (!user) {
            const newUser = {
                wixUserId: decoded.userId,
                email: decoded.email || '',
                displayName: decoded.displayName || '',
                planId: 'none',
                credits: 0,
                totalCredits: 0,
                totalUsed: 0,
                features: [],
                allowedModels: [],
                subscriptionStatus: 'none',
                tracks: [],
                stemHistory: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await usersCollection.insertOne(newUser);
            user = newUser;
        }
        
        // Kullanıcı bilgilerini döndür
        return res.status(200).json({
            success: true,
            user: {
                id: user._id,
                wixUserId: user.wixUserId,
                email: user.email,
                displayName: user.displayName,
                planId: user.planId || 'none',
                plan: user.planId || 'none',
                credits: user.credits || 0,
                totalCredits: user.totalCredits || 0,
                totalUsed: user.totalUsed || 0,
                features: user.features || [],
                allowedModels: user.allowedModels || [],
                subscriptionStatus: user.subscriptionStatus || 'none',
                daysRemaining: getDaysRemaining(user.expiresAt),
                expiresAt: user.expiresAt,
                totalSongsGenerated: user.totalSongsGenerated || 0
            }
        });
        
    } catch (error) {
        console.error('Auth sync error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
};
