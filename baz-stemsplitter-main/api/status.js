// api/status.js - API Durumu ve Sağlık Kontrolü
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // MongoDB bağlantısını test et
        const { db } = await connectToDatabase();
        
        // Basit bir sorgu ile bağlantıyı doğrula
        const collections = await db.listCollections().toArray();
        
        // Kullanıcı istatistikleri
        const usersCollection = db.collection('users');
        const totalUsers = await usersCollection.countDocuments();
        const activeUsers = await usersCollection.countDocuments({ 
            subscriptionStatus: 'active' 
        });
        
        // Görsel istatistikleri
        const imagesCollection = db.collection('cover_images');
        const totalImages = await imagesCollection.countDocuments();
        
        // Transaction istatistikleri
        const transactionsCollection = db.collection('transactions');
        const totalTransactions = await transactionsCollection.countDocuments();
        
        return res.status(200).json({
            success: true,
            status: 'healthy',
            service: 'BAZ AI Cover Designer API',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                name: 'bazai',
                collections: collections.length
            },
            stats: {
                totalUsers: totalUsers,
                activeUsers: activeUsers,
                totalImages: totalImages,
                totalTransactions: totalTransactions
            },
            endpoints: {
                auth: '/api/auth-sync',
                credits: '/api/use-credits',
                addCredits: '/api/add-credits',
                webhook: '/api/wix-webhook',
                userData: '/api/user-data',
                images: {
                    generate: '/api/generate-image',
                    status: '/api/image-status',
                    save: '/api/save-image',
                    list: '/api/list-images',
                    get: '/api/get-image',
                    delete: '/api/delete-image'
                }
            }
        });
        
    } catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({
            success: false,
            status: 'unhealthy',
            service: 'BAZ AI Cover Designer API',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
