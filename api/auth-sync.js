// api/auth-sync.js - Vercel Serverless Function
const { MongoClient } = require('mongodb');

// MongoDB bağlantısı (singleton)
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
        throw new Error('MONGODB_URI environment variable not set');
    }
    
    const client = new MongoClient(uri);
    await client.connect();
    
    const db = client.db('bazai');
    
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
}

// Token çözümleme
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

// Kalan gün hesapla
function getDaysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Token al
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Token gerekli'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                error: 'Token missing',
                message: 'Token bulunamadı'
            });
        }
        
        // Token'ı çöz
        const decoded = decodeToken(token);
        
        if (!decoded || !decoded.userId) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Geçersiz token'
            });
        }
        
        // Token süresi kontrolü (7 gün)
        if (decoded.timestamp && Date.now() - decoded.timestamp > 7 * 24 * 60 * 60 * 1000) {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Token süresi dolmuş, lütfen tekrar giriş yapın'
            });
        }
        
        // MongoDB bağlan
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        
        // Kullanıcıyı bul
        let user = await usersCollection.findOne({ wixUserId: decoded.userId });
        
        // Yoksa oluştur
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
                purchasedAt: null,
                expiresAt: null,
                totalSongsGenerated: 0,
                tracks: [],
                stemHistory: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            const result = await usersCollection.insertOne(newUser);
            user = { ...newUser, _id: result.insertedId };
        }
        
        // Abonelik durumu kontrolü
        const isActive = user.subscriptionStatus === 'active' && 
                         user.credits > 0 && 
                         (!user.expiresAt || new Date(user.expiresAt) > new Date());
        
        // Başarılı response
        return res.status(200).json({
            success: true,
            user: {
                id: user._id.toString(),
                wixUserId: user.wixUserId,
                email: user.email,
                displayName: user.displayName,
                plan: user.planId,
                planId: user.planId,
                credits: user.credits || 0,
                available: user.credits || 0,
                totalCredits: user.totalCredits || 0,
                used: user.totalUsed || 0,
                features: user.features || [],
                allowedModels: user.allowedModels || [],
                subscriptionStatus: user.subscriptionStatus || 'none',
                expiresAt: user.expiresAt,
                daysRemaining: getDaysRemaining(user.expiresAt),
                isActive: isActive,
                totalSongsGenerated: user.totalSongsGenerated || 0
            }
        });
        
    } catch (error) {
        console.error('Auth sync error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: 'Sunucu hatası: ' + error.message
        });
    }
};
