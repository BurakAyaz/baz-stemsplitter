// api/stem.js - Vocal & Instrument Stem Separation API Endpoint
// Auth sistemi entegre edildi

const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    
    const uri = process.env.MONGODB_URI;
    if (!uri) return null;
    
    try {
        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db('bazai');
        
        cachedClient = client;
        cachedDb = db;
        
        return { client, db };
    } catch (e) {
        console.error('MongoDB connection error:', e);
        return null;
    }
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
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. Sadece POST isteği kabul et
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST isteği kabul edilir.' });
    }

    // 2. API Key Kontrolü
    if (!process.env.KIE_API_KEY) {
        return res.status(500).json({ error: 'Sunucu hatası: API Key eksik (Vercel Ayarlarını Kontrol Et).' });
    }

    try {
        const { taskId, audioId, type, callBackUrl } = req.body;

        // 3. Validasyon
        if (!taskId || !audioId) {
            return res.status(400).json({ 
                error: 'taskId ve audioId zorunludur.',
                details: 'BAZ AI\'da oluşturulmuş bir şarkı seçmelisiniz.'
            });
        }

        if (!type || !['separate_vocal', 'split_stem'].includes(type)) {
            return res.status(400).json({ 
                error: 'Geçersiz type parametresi.',
                details: 'separate_vocal veya split_stem olmalı.'
            });
        }

        // 4. Kullanıcı bilgisini al (auth varsa)
        let userId = null;
        let userEmail = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = decodeToken(token);
            if (decoded) {
                userId = decoded.userId;
                userEmail = decoded.email;
                console.log(`Stem request from user: ${userId}, email: ${userEmail}`);
            }
        }

        // 5. Callback URL'ini belirle - Production URL kullan
        // Vercel preview deployments farklı URL'ler alabilir, sabit URL kullan
        const baseUrl = process.env.CALLBACK_BASE_URL || 
                        process.env.BASE_URL || 
                        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                        'https://stem.burakayaz.com';
        
        const callbackUrl = `${baseUrl}/api/stem-callback`;
        
        console.log('=== STEM REQUEST ===');
        console.log('baseUrl:', baseUrl);
        console.log('callbackUrl:', callbackUrl);
        
        // 6. Kie.ai'ye gidecek paketi hazırlıyoruz
        const payload = {
            taskId: taskId,
            audioId: audioId,
            type: type,
            callBackUrl: callbackUrl
        };

        console.log("Stem API - Kie.ai'ye giden istek:", payload);
        console.log("Callback URL:", callbackUrl);

        // 7. Kie.ai API İsteği - Vocal Separation endpoint
        const response = await fetch('https://api.kie.ai/api/v1/vocal-removal/generate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 8. Hata Kontrolü
        if (!response.ok) {
            console.error("Stem API Hatası:", data);
            throw new Error(data.msg || data.error || JSON.stringify(data));
        }

        // 9. Stem task'ı MongoDB'ye kaydet (polling için)
        if (data.data && data.data.taskId) {
            try {
                const dbConnection = await connectToDatabase();
                if (dbConnection) {
                    const { db } = dbConnection;
                    
                    // stemResults collection'ına pending olarak kaydet
                    await db.collection('stemResults').insertOne({
                        taskId: data.data.taskId,
                        originalTaskId: taskId,
                        audioId: audioId,
                        type: type,
                        status: 'pending',
                        wixUserId: userId,
                        email: userEmail, // Email de kaydet
                        createdAt: new Date()
                    });
                    
                    console.log('Stem task saved to MongoDB:', data.data.taskId, 'email:', userEmail);
                }
            } catch (dbError) {
                console.error('MongoDB save error:', dbError);
            }
        }

        // 10. Başarılı - Activity log ekle (opsiyonel)
        if (userId && process.env.MONGODB_URI) {
            try {
                const dbConnection = await connectToDatabase();
                if (dbConnection) {
                    const { db } = dbConnection;
                    await db.collection('users').updateOne(
                        { wixUserId: userId },
                        {
                            $push: {
                                activityLog: {
                                    action: 'stem_separation',
                                    type: type,
                                    taskId: taskId,
                                    newTaskId: data.data?.taskId,
                                    timestamp: new Date()
                                }
                            }
                        }
                    );
                }
            } catch (logError) {
                console.error('Activity log error:', logError);
                // Log hatası ana işlemi durdurmasın
            }
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Stem Proxy Hatası:", error);
        return res.status(500).json({ 
            error: 'Stem ayrıştırma işlemi başlatılamadı', 
            details: error.message 
        });
    }
};
