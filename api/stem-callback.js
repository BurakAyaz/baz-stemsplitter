// api/stem-callback.js - KIE API Callback Endpoint
// KIE API işlem tamamlandığında buraya POST yapar

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('=== KIE CALLBACK RECEIVED ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    try {
        const { code, msg, data } = req.body;

        // KIE API callback formatı:
        // {
        //   "code": 200,
        //   "msg": "vocal separation generated successfully.",
        //   "data": {
        //     "task_id": "xxx",
        //     "vocal_separation_info": {
        //       "instrumental_url": "https://...",
        //       "vocal_url": "https://...",
        //       // split_stem için ek URL'ler
        //     }
        //   }
        // }

        if (code !== 200 || !data) {
            console.log('Callback error or no data:', msg);
            return res.status(200).json({ status: 'received', error: msg });
        }

        const taskId = data.task_id;
        const stemInfo = data.vocal_separation_info;

        if (!taskId || !stemInfo) {
            console.log('Missing taskId or stemInfo');
            return res.status(200).json({ status: 'received', error: 'missing data' });
        }

        console.log('Task ID:', taskId);
        console.log('Vocal URL:', stemInfo.vocal_url);
        console.log('Instrumental URL:', stemInfo.instrumental_url);

        // MongoDB'ye kaydet - stemResults collection'ına
        const { db } = await connectToDatabase();
        
        // Sonucu stemResults collection'ına kaydet
        await db.collection('stemResults').updateOne(
            { taskId: taskId },
            {
                $set: {
                    taskId: taskId,
                    status: 'success',
                    stems: {
                        vocal_url: stemInfo.vocal_url,
                        instrumental_url: stemInfo.instrumental_url,
                        // Split stem için ek URL'ler
                        drums_url: stemInfo.drums_url || null,
                        bass_url: stemInfo.bass_url || null,
                        guitar_url: stemInfo.guitar_url || null,
                        keyboard_url: stemInfo.keyboard_url || null,
                        strings_url: stemInfo.strings_url || null,
                        brass_url: stemInfo.brass_url || null,
                        woodwinds_url: stemInfo.woodwinds_url || null,
                        percussion_url: stemInfo.percussion_url || null,
                        synth_url: stemInfo.synth_url || null,
                        fx_url: stemInfo.fx_url || null,
                        backing_vocals_url: stemInfo.backing_vocals_url || null,
                        origin_url: stemInfo.origin_url || null
                    },
                    type: stemInfo.drums_url ? 'split_stem' : 'separate_vocal',
                    completedAt: new Date(),
                    rawCallback: req.body
                }
            },
            { upsert: true }
        );

        console.log('Stem result saved to MongoDB');

        // KIE API'ye 200 dön (callback alındı)
        return res.status(200).json({ status: 'received' });

    } catch (error) {
        console.error('Callback error:', error);
        return res.status(200).json({ status: 'error', message: error.message });
    }
};
