// api/stem.js - Vocal & Instrument Stem Separation API Endpoint
const { MongoClient } = require('mongodb');

// MongoDB bağlantısı (singleton)
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

// Token çözümleme
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
    // CORS ayarları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST isteği kabul edilir.' });
    }

    if (!process.env.KIE_API_KEY) {
        return res.status(500).json({ error: 'Sunucu hatası: KIE_API_KEY eksik.' });
    }

    try {
        const { taskId, audioId, type, callBackUrl } = req.body;

        // 1. Validasyon: KIE her iki ID'yi de zorunlu tutar
        if (!taskId || !audioId) {
            return res.status(400).json({ 
                error: 'taskId ve audioId zorunludur.',
                details: 'Lütfen listeden bir şarkı seçtiğinizden emin olun.'
            });
        }

        // 2. Auth ve Kullanıcı Tanımlama
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = decodeToken(token);
            if (decoded && decoded.userId) {
                userId = decoded.userId;
            }
        }

        // 3. KIE API İsteği (Dokümantasyona Göre Güncellendi)
        // 
        const payload = {
            taskId: taskId,    // Şarkının ana görev ID'si
            audioId: audioId,  // Şarkının ses dosyası ID'si
            type: type || 'separate_vocal',
            callBackUrl: callBackUrl || "https://google.com" // Boş gönderilmemelidir
        };

        console.log("KIE API Tetikleniyor, Payload:", JSON.stringify(payload));

        const response = await fetch('https://api.kie.ai/api/v1/vocal-removal/generate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("KIE API Yanıt Hatası:", data);
            return res.status(response.status).json({
                error: 'KIE API hatası',
                details: data.msg || data.error || 'İşlem başlatılamadı'
            });
        }

        // 4. Başarılı İşlemden Sonra MongoDB Loglama
        if (userId) {
            try {
                const dbConnection = await connectToDatabase();
                if (dbConnection) {
                    const { db } = dbConnection;
                    await db.collection('users').updateOne(
                        { wixUserId: userId },
                        {
                            $push: {
                                activityLog: {
                                    action: 'stem_separation_start',
                                    type: type,
                                    sourceTaskId: taskId,
                                    newTaskId: data.data?.taskId || data.taskId,
                                    timestamp: new Date()
                                }
                            },
                            $set: { updatedAt: new Date() }
                        }
                    );
                }
            } catch (dbError) {
                console.error('MongoDB logging error:', dbError);
            }
        }

        // 5. Yanıtı Döndür
        return res.status(200).json(data);

    } catch (error) {
        console.error("Stem Proxy Sunucu Hatası:", error);
        return res.status(500).json({ 
            error: 'Stem ayrıştırma isteği sırasında bir hata oluştu', 
            details: error.message 
        });
    }
};
