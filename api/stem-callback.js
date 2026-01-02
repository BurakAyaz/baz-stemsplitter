// api/stem-callback.js - KIE API Callback Endpoint
// KIE API işlem tamamlandığında buraya POST yapar
// Cloudinary'ye yükler ve kalıcı URL oluşturur

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

// Cloudinary'ye URL'den dosya yükle
async function uploadToCloudinary(url, publicId, resourceType = 'video') {
    if (!url || !process.env.CLOUDINARY_CLOUD_NAME) {
        console.log('Cloudinary config missing or no URL');
        return url; // Orijinal URL'i döndür
    }
    
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        
        if (!apiKey || !apiSecret) {
            console.log('Cloudinary credentials missing');
            return url;
        }
        
        // Cloudinary upload URL
        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
        
        // Timestamp ve signature oluştur
        const timestamp = Math.round(Date.now() / 1000);
        const crypto = require('crypto');
        const signatureString = `folder=baz-stems&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
        const signature = crypto.createHash('sha1').update(signatureString).digest('hex');
        
        // FormData oluştur
        const formData = new URLSearchParams();
        formData.append('file', url);
        formData.append('public_id', publicId);
        formData.append('folder', 'baz-stems');
        formData.append('timestamp', timestamp.toString());
        formData.append('api_key', apiKey);
        formData.append('signature', signature);
        formData.append('resource_type', resourceType);
        
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.secure_url) {
            console.log('Cloudinary upload success:', result.secure_url);
            return result.secure_url;
        } else {
            console.error('Cloudinary upload failed:', result);
            return url;
        }
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return url; // Hata durumunda orijinal URL'i döndür
    }
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
        console.log('Original Vocal URL:', stemInfo.vocal_url);
        console.log('Original Instrumental URL:', stemInfo.instrumental_url);

        // Cloudinary'ye yükle (eğer config varsa)
        const timestamp = Date.now();
        const vocalUrl = await uploadToCloudinary(
            stemInfo.vocal_url, 
            `vocal_${taskId}_${timestamp}`,
            'video' // audio için video resource type kullanılır
        );
        const instrumentalUrl = await uploadToCloudinary(
            stemInfo.instrumental_url, 
            `instrumental_${taskId}_${timestamp}`,
            'video'
        );

        // Split stem için diğer URL'leri de yükle
        let additionalStems = {};
        if (stemInfo.drums_url) {
            additionalStems.drums_url = await uploadToCloudinary(stemInfo.drums_url, `drums_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.bass_url) {
            additionalStems.bass_url = await uploadToCloudinary(stemInfo.bass_url, `bass_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.guitar_url) {
            additionalStems.guitar_url = await uploadToCloudinary(stemInfo.guitar_url, `guitar_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.keyboard_url) {
            additionalStems.keyboard_url = await uploadToCloudinary(stemInfo.keyboard_url, `keyboard_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.strings_url) {
            additionalStems.strings_url = await uploadToCloudinary(stemInfo.strings_url, `strings_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.brass_url) {
            additionalStems.brass_url = await uploadToCloudinary(stemInfo.brass_url, `brass_${taskId}_${timestamp}`, 'video');
        }
        if (stemInfo.backing_vocals_url) {
            additionalStems.backing_vocals_url = await uploadToCloudinary(stemInfo.backing_vocals_url, `backing_${taskId}_${timestamp}`, 'video');
        }

        console.log('Cloudinary Vocal URL:', vocalUrl);
        console.log('Cloudinary Instrumental URL:', instrumentalUrl);

        // MongoDB'ye kaydet
        const { db } = await connectToDatabase();
        
        const stems = {
            vocal_url: vocalUrl,
            instrumental_url: instrumentalUrl,
            drums_url: additionalStems.drums_url || null,
            bass_url: additionalStems.bass_url || null,
            guitar_url: additionalStems.guitar_url || null,
            keyboard_url: additionalStems.keyboard_url || null,
            strings_url: additionalStems.strings_url || null,
            brass_url: additionalStems.brass_url || null,
            woodwinds_url: stemInfo.woodwinds_url || null,
            percussion_url: stemInfo.percussion_url || null,
            synth_url: stemInfo.synth_url || null,
            fx_url: stemInfo.fx_url || null,
            backing_vocals_url: additionalStems.backing_vocals_url || null,
            origin_url: stemInfo.origin_url || null,
            // Orijinal URL'leri de sakla (backup)
            original_vocal_url: stemInfo.vocal_url,
            original_instrumental_url: stemInfo.instrumental_url
        };

        await db.collection('stemResults').updateOne(
            { taskId: taskId },
            {
                $set: {
                    taskId: taskId,
                    status: 'success',
                    stems: stems,
                    type: stemInfo.drums_url ? 'split_stem' : 'separate_vocal',
                    completedAt: new Date(),
                    rawCallback: req.body
                }
            },
            { upsert: true }
        );

        console.log('Stem result saved to MongoDB with Cloudinary URLs');

        return res.status(200).json({ status: 'received' });

    } catch (error) {
        console.error('Callback error:', error);
        return res.status(200).json({ status: 'error', message: error.message });
    }
};
