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

// Cloudinary'ye URL'den dosya yükle (unsigned preset ile)
async function uploadToCloudinary(url, filename) {
    if (!url) return null;
    
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'Unsigned';
    
    if (!cloudName) {
        console.log('Cloudinary config missing, returning original URL');
        return url;
    }
    
    try {
        console.log(`Uploading to Cloudinary: ${filename}`);
        
        // Cloudinary unsigned upload
        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
        
        const formData = new URLSearchParams();
        formData.append('file', url);
        formData.append('upload_preset', uploadPreset);
        formData.append('folder', 'baz-stems');
        formData.append('public_id', filename);
        formData.append('resource_type', 'video'); // audio için video kullanılır
        
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
            return url; // Hata durumunda orijinal URL'i döndür
        }
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return url;
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

        const { db } = await connectToDatabase();

        // Mevcut pending kaydı bul (email bilgisi için)
        const pendingTask = await db.collection('stemResults').findOne({ taskId: taskId });
        const userEmail = pendingTask?.email;
        const wixUserId = pendingTask?.wixUserId;

        // Timestamp for unique filenames
        const timestamp = Date.now();

        // Cloudinary'ye yükle
        const vocalUrl = await uploadToCloudinary(
            stemInfo.vocal_url, 
            `vocal_${taskId.slice(-8)}_${timestamp}`
        );
        const instrumentalUrl = await uploadToCloudinary(
            stemInfo.instrumental_url, 
            `instrumental_${taskId.slice(-8)}_${timestamp}`
        );

        // 12 Stem için diğer URL'leri de yükle
        let additionalStems = {};
        const stemTypes = [
            'drums_url', 'bass_url', 'guitar_url', 'keyboard_url',
            'strings_url', 'brass_url', 'woodwinds_url', 'percussion_url',
            'synth_url', 'fx_url', 'backing_vocals_url', 'origin_url'
        ];

        for (const stemType of stemTypes) {
            if (stemInfo[stemType]) {
                const stemName = stemType.replace('_url', '');
                additionalStems[stemType] = await uploadToCloudinary(
                    stemInfo[stemType], 
                    `${stemName}_${taskId.slice(-8)}_${timestamp}`
                );
            }
        }

        console.log('Cloudinary Vocal URL:', vocalUrl);
        console.log('Cloudinary Instrumental URL:', instrumentalUrl);

        // Stem tipini belirle
        const isSplitStem = stemInfo.drums_url || stemInfo.bass_url || stemInfo.guitar_url;
        const stemType = isSplitStem ? 'split_stem' : 'separate_vocal';

        // Stem sonuçlarını hazırla
        const stems = {
            vocal_url: vocalUrl,
            instrumental_url: instrumentalUrl,
            drums_url: additionalStems.drums_url || null,
            bass_url: additionalStems.bass_url || null,
            guitar_url: additionalStems.guitar_url || null,
            keyboard_url: additionalStems.keyboard_url || null,
            strings_url: additionalStems.strings_url || null,
            brass_url: additionalStems.brass_url || null,
            woodwinds_url: additionalStems.woodwinds_url || null,
            percussion_url: additionalStems.percussion_url || null,
            synth_url: additionalStems.synth_url || null,
            fx_url: additionalStems.fx_url || null,
            backing_vocals_url: additionalStems.backing_vocals_url || null,
            origin_url: additionalStems.origin_url || null
        };

        // stemResults collection'ını güncelle
        await db.collection('stemResults').updateOne(
            { taskId: taskId },
            {
                $set: {
                    taskId: taskId,
                    status: 'success',
                    stems: stems,
                    type: stemType,
                    completedAt: new Date(),
                    rawCallback: req.body
                }
            },
            { upsert: true }
        );

        console.log('Stem result saved to MongoDB');

        // Kullanıcının stemHistory'sine kaydet
        if (wixUserId || userEmail) {
            // Kullanıcıyı bul
            let userQuery = {};
            if (wixUserId) userQuery.wixUserId = wixUserId;
            else if (userEmail) userQuery.email = userEmail;

            const user = await db.collection('users').findOne(userQuery);

            if (user) {
                const stemEntry = {
                    taskId: taskId,
                    stems: stems,
                    type: stemType,
                    createdAt: new Date()
                };

                // stemHistory'ye ekle
                await db.collection('users').updateOne(
                    userQuery,
                    {
                        $push: {
                            stemHistory: {
                                $each: [stemEntry],
                                $position: 0,
                                $slice: 50 // Son 50 kaydı tut
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                console.log('User stemHistory updated');
            }
        }

        return res.status(200).json({ status: 'received' });

    } catch (error) {
        console.error('Callback error:', error);
        return res.status(200).json({ status: 'error', message: error.message });
    }
};
