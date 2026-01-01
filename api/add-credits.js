// api/add-credits.js - Manuel Kredi Ekleme (Test/Admin için)
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

// Paket tanımları
const PLANS = {
    'temel': { credits: 50, duration: 30, name: 'Temel Paket' },       // 1 ay
    'uzman': { credits: 500, duration: 180, name: 'Uzman Paket' },     // 6 ay
    'pro': { credits: 1000, duration: 365, name: 'Pro Paket' },        // 1 yıl
    'deneme': { credits: 1000, duration: 30, name: 'Deneme Paket' },   // TEST - 0 TL
    'test': { credits: 1000, duration: 30, name: 'Test Paket' }        // TEST - 0 TL
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Admin key kontrolü (güvenlik için)
        const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
        const expectedKey = process.env.ADMIN_KEY || 'baz-admin-2024';
        
        if (adminKey !== expectedKey) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Geçersiz admin key' });
        }
        
        const { wixUserId, planId, credits } = req.body;
        
        if (!wixUserId) {
            return res.status(400).json({ error: 'wixUserId gerekli' });
        }
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        
        // Kullanıcıyı bul
        let user = await usersCollection.findOne({ wixUserId: wixUserId });
        
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        const now = new Date();
        let creditsToAdd = 0;
        let newPlanId = user.planId;
        let expiresAt = user.expiresAt;
        
        if (planId && PLANS[planId.toLowerCase()]) {
            // Plan bazlı kredi ekleme
            const plan = PLANS[planId.toLowerCase()];
            creditsToAdd = plan.credits;
            newPlanId = planId.toLowerCase();
            expiresAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
        } else if (credits && typeof credits === 'number') {
            // Manuel kredi ekleme
            creditsToAdd = credits;
        } else {
            return res.status(400).json({ error: 'planId veya credits gerekli' });
        }
        
        // Kullanıcıyı güncelle
        await usersCollection.updateOne(
            { wixUserId: wixUserId },
            { 
                $set: {
                    planId: newPlanId,
                    credits: user.credits + creditsToAdd,
                    totalCredits: (user.totalCredits || 0) + creditsToAdd,
                    subscriptionStatus: 'active',
                    expiresAt: expiresAt,
                    updatedAt: now
                }
            }
        );
        
        console.log(`💰 Kredi eklendi: ${wixUserId} - Miktar: ${creditsToAdd} - Yeni bakiye: ${user.credits + creditsToAdd}`);
        
        return res.status(200).json({
            success: true,
            message: 'Kredi eklendi',
            data: {
                wixUserId: wixUserId,
                creditsAdded: creditsToAdd,
                previousBalance: user.credits,
                newBalance: user.credits + creditsToAdd,
                planId: newPlanId
            }
        });
        
    } catch (error) {
        console.error('Add credits error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
};
