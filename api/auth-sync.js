// api/auth-sync.js - Vercel Serverless Function
// Referans ile tam uyumlu + visuals dizisi desteği
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
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// Ana Handler Fonksiyonu
export default async (req, res) => {
    try {
        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        
        // Token'dan kullanıcıyı bulma mantığı (mevcut kodunuz)
        // ... (Token decode işlemleri)

        let user = await usersCollection.findOne({ wixUserId: decoded.userId });

        if (user) {
            const now = new Date();
            const expiryDate = user.expiresAt ? new Date(user.expiresAt) : null;
            
            // KRİTİK KONTROL: Süre dolmuş mu?
            if (expiryDate && expiryDate < now && user.credits > 0) {
                console.log(`Kullanıcının (${user.wixUserId}) süresi dolmuş, krediler sıfırlanıyor.`);
                
                // MongoDB'de krediyi sıfırla
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { credits: 0 } }
                );
                
                // Yerel kullanıcı objesini güncelle
                user.credits = 0;
            }
        }

        // Başarılı response döndürürken güncel krediyi gönder
        const isActive = user.subscriptionStatus === 'active' && 
                         user.credits > 0 && 
                         (!user.expiresAt || new Date(user.expiresAt) > new Date());

        return res.status(200).json({
            success: true,
            user: {
                id: user._id.toString(),
                wixUserId: user.wixUserId,
                credits: user.credits, // Sıfırlanmış değer gidecek
                subscriptionStatus: user.subscriptionStatus,
                expiresAt: user.expiresAt,
                daysRemaining: getDaysRemaining(user.expiresAt),
                isActive: isActive
            }
        });

    } catch (error) {
        console.error('Auth sync error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};
