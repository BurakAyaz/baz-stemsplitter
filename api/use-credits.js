// api/use-credits.js - Kredi Harcama API'si
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Token'dan kullanıcı bilgisi al
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token gerekli' });
        }
        
        const token = authHeader.substring(7);
        const decoded = decodeToken(token);
        
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ error: 'Geçersiz token' });
        }
        
        // Harcama miktarı - stem işlemleri için özel: stem_vocal = 2, stem_12 = 5
        const { amount = 1, action = 'song_generate', songId = null } = req.body;
        
        // Stem işlemleri için kredi miktarlarını otomatik ayarla
        let finalAmount = amount;
        if (action === 'stem_vocal') {
            finalAmount = 2; // Vokal + Enstrüman = 2 kredi
        } else if (action === 'stem_12') {
            finalAmount = 5; // 12 Enstrüman = 5 kredi
        }
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        const transactionsCollection = db.collection('transactions');
        
        // Kullanıcıyı bul
        const user = await usersCollection.findOne({ wixUserId: decoded.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        // Kredi kontrolü
        if (user.credits < finalAmount) {
            return res.status(400).json({ 
                error: 'Yetersiz kredi',
                currentCredits: user.credits,
                required: finalAmount
            });
        }
        
        // Krediyi düş
        const newCredits = user.credits - finalAmount;
        const newTotalUsed = (user.totalUsed || 0) + finalAmount;
        const newSongsGenerated = (user.totalSongsGenerated || 0) + 1;
        
        await usersCollection.updateOne(
            { wixUserId: decoded.userId },
            { 
                $set: {
                    credits: newCredits,
                    totalUsed: newTotalUsed,
                    totalSongsGenerated: newSongsGenerated,
                    updatedAt: new Date()
                }
            }
        );
        
        // İşlem kaydı oluştur
        const transaction = {
            wixUserId: decoded.userId,
            type: 'usage',
            action: action,
            songId: songId,
            credits: -finalAmount,
            balanceAfter: newCredits,
            createdAt: new Date()
        };
        
        await transactionsCollection.insertOne(transaction);
        
        console.log('Kredi harcandı:', decoded.userId, 'Miktar:', finalAmount, 'Action:', action, 'Kalan:', newCredits);
        
        return res.status(200).json({
            success: true,
            message: 'Kredi harcandı',
            data: {
                creditsUsed: finalAmount,
                remainingCredits: newCredits,
                totalUsed: newTotalUsed,
                totalSongsGenerated: newSongsGenerated
            }
        });
        
    } catch (error) {
        console.error('Use credits error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
};
