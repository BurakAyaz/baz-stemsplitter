// api/debug-stems.js - Debug endpoint to check stemResults
// URL: /api/debug-stems?taskId=xxx

const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
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
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { taskId, action } = req.query;

    try {
        const { db } = await connectToDatabase();

        // Collections listesi
        if (action === 'collections') {
            const collections = await db.listCollections().toArray();
            return res.status(200).json({
                collections: collections.map(c => c.name)
            });
        }

        // stemResults collection'ındaki tüm kayıtları say
        if (action === 'count') {
            const count = await db.collection('stemResults').countDocuments();
            return res.status(200).json({ stemResultsCount: count });
        }

        if (taskId) {
            // Belirli bir task'ı getir
            const stemResult = await db.collection('stemResults').findOne({ taskId: taskId });
            return res.status(200).json({
                found: !!stemResult,
                taskId: taskId,
                data: stemResult
            });
        } else {
            // Son 10 kaydı getir
            const recentResults = await db.collection('stemResults')
                .find({})
                .sort({ createdAt: -1 })
                .limit(10)
                .toArray();
            
            // Collection var mı kontrol et
            const collections = await db.listCollections({ name: 'stemResults' }).toArray();
            const collectionExists = collections.length > 0;
            
            return res.status(200).json({
                collectionExists: collectionExists,
                count: recentResults.length,
                results: recentResults.map(r => ({
                    taskId: r.taskId,
                    status: r.status,
                    type: r.type,
                    hasStems: !!r.stems,
                    vocalUrl: r.stems?.vocal_url ? r.stems.vocal_url.substring(0, 50) + '...' : 'YOK',
                    wixUserId: r.wixUserId,
                    email: r.email,
                    createdAt: r.createdAt,
                    completedAt: r.completedAt
                }))
            });
        }

    } catch (error) {
        console.error('Debug error:', error);
        return res.status(500).json({ error: error.message });
    }
};
