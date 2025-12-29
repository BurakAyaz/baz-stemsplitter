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
        
        // Harcama miktarı (varsayılan 1)
        const { amount = 1, action = 'song_generate', songId = null } = req.body;
        
        const { db } = await connectToDatabase();
        const usersCollection = db.collection('users');
        const transactionsCollection = db.collection('transactions');
        
        // Kullanıcıyı bul
        const user = await usersCollection.findOne({ wixUserId: decoded.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        // Kredi kontrolü
        if (user.credits < amount) {
            return res.status(400).json({ 
                error: 'Yetersiz kredi',
                currentCredits: user.credits,
                required: amount
            });
        }
        
        // Krediyi düş
        const newCredits = user.credits - amount;
        const newTotalUsed = (user.totalUsed || 0) + amount;
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
            credits: -amount,
            balanceAfter: newCredits,
            createdAt: new Date()
        };
        
        await transactionsCollection.insertOne(transaction);
        
        console.log('Kredi harcandı:', decoded.userId, 'Miktar:', amount, 'Kalan:', newCredits);
        
        return res.status(200).json({
            success: true,
            message: 'Kredi harcandı',
            data: {
                creditsUsed: amount,
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
