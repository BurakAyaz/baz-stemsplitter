// api/wix-webhook.js - Wix Ödeme Webhook'u
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// MongoDB bağlantısı
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
    'temel': { credits: 50, price: 300, duration: 30, name: 'Temel Paket' },       // 1 ay
    'uzman': { credits: 500, price: 2800, duration: 180, name: 'Uzman Paket' },    // 6 ay
    'pro': { credits: 1000, price: 5000, duration: 365, name: 'Pro Paket' },       // 1 yıl
    'deneme': { credits: 1000, price: 0, duration: 30, name: 'Deneme Paket' },     // TEST - 0 TL
    'test': { credits: 1000, price: 0, duration: 30, name: 'Test Paket' }          // TEST - 0 TL
};

// Webhook doğrulama (opsiyonel - Wix secret ile)
function verifyWebhook(payload, signature, secret) {
    if (!secret) return true; // Secret yoksa doğrulama atla
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');
    
    return signature === expectedSignature;
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Wix-Signature');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const payload = req.body;
        
        // Webhook doğrulama (opsiyonel)
        const signature = req.headers['x-wix-signature'];
        const secret = process.env.WIX_WEBHOOK_SECRET;
        
        if (secret && !verifyWebhook(payload, signature, secret)) {
            console.error('Invalid webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Gerekli alanları kontrol et
        const { wixUserId, planId, orderId, email, displayName } = payload;
        
        if (!wixUserId || !planId) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                message: 'wixUserId ve planId gerekli'
            });
        }
        
        // Plan kontrolü
        const plan = PLANS[planId.toLowerCase()];
        if (!plan) {
            return res.status(400).json({ 
                error: 'Invalid plan',
                message: 'Geçersiz paket: ' + planId
            });
        }
        
        // MongoDB bağlan
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        const transactionsCollection = db.collection('transactions');
        
        // Kullanıcıyı bul veya oluştur
        let user = await usersCollection.findOne({ wixUserId: wixUserId });
        
        const now = new Date();
        const expiresAt = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);
        
        if (!user) {
            // Yeni kullanıcı oluştur
            const newUser = {
                wixUserId: wixUserId,
                email: email || '',
                displayName: displayName || '',
                planId: planId.toLowerCase(),
                credits: plan.credits,
                totalCredits: plan.credits,
                totalUsed: 0,
                subscriptionStatus: 'active',
                purchasedAt: now,
                expiresAt: expiresAt,
                totalSongsGenerated: 0,
                totalImagesGenerated: 0,
                visuals: [], // Görsel galerisi için boş dizi
                tracks: [],
                generatedLyrics: [],
                personas: [],
                activityLog: [],
                settings: {},
                createdAt: now,
                updatedAt: now
            };
            
            await usersCollection.insertOne(newUser);
            user = newUser;
            
            console.log('✨ Yeni kullanıcı oluşturuldu:', planId, 'Kredi:', plan.credits);
        } else {
            // Mevcut kullanıcıyı güncelle
            const updateData = {
                planId: planId.toLowerCase(),
                credits: user.credits + plan.credits, // Mevcut krediye ekle
                totalCredits: (user.totalCredits || 0) + plan.credits,
                subscriptionStatus: 'active',
                purchasedAt: now,
                expiresAt: expiresAt,
                updatedAt: now
            };
            
            if (email) updateData.email = email;
            if (displayName) updateData.displayName = displayName;
            
            // Visuals dizisi yoksa ekle
            if (!Array.isArray(user.visuals)) {
                updateData.visuals = [];
            }
            
            await usersCollection.updateOne(
                { wixUserId: wixUserId },
                { $set: updateData }
            );
            
            console.log('💰 Kullanıcı güncellendi:', planId, 'Yeni kredi:', user.credits + plan.credits);
        }
        
        // İşlem kaydı oluştur
        const transaction = {
            wixUserId: wixUserId,
            orderId: orderId || null,
            type: 'purchase',
            planId: planId.toLowerCase(),
            planName: plan.name,
            credits: plan.credits,
            amount: plan.price,
            currency: 'TRY',
            status: 'completed',
            createdAt: now
        };
        
        await transactionsCollection.insertOne(transaction);
        
        // Başarılı response
        return res.status(200).json({
            success: true,
            message: 'Kredi başarıyla yüklendi',
            data: {
                wixUserId: wixUserId,
                planId: planId,
                creditsAdded: plan.credits,
                newBalance: user ? user.credits + plan.credits : plan.credits,
                expiresAt: expiresAt
            }
        });
        
    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: 'Sunucu hatası: ' + error.message
        });
    }
};
