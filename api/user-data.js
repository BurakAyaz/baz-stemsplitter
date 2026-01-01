// api/user-data.js - Kullanıcı Verileri API'si (şarkılar, loglar, ayarlar)
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Token kontrolü
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token gerekli' });
    }
    
    const token = authHeader.substring(7);
    const decoded = decodeToken(token);
    
    if (!decoded || !decoded.userId) {
        return res.status(401).json({ error: 'Geçersiz token' });
    }
    
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    
    try {
        // GET - Kullanıcı verilerini getir
        if (req.method === 'GET') {
            const user = await usersCollection.findOne({ wixUserId: decoded.userId });
            
            // Kullanıcı yoksa boş veri döndür (hata değil)
            if (!user) {
                return res.status(200).json({
                    success: true,
                    data: {
                        credits: 0,
                        plan: 'free',
                        planExpiry: null,
                        tracks: [],
                        stemHistory: [],
                        generatedLyrics: [],
                        personas: [],
                        activityLog: [],
                        totalSongsGenerated: 0,
                        totalCreditsUsed: 0,
                        settings: {}
                    }
                });
            }
            
            return res.status(200).json({
                success: true,
                data: {
                    credits: user.credits || 0,
                    plan: user.planId || 'free',
                    planExpiry: user.expiresAt,
                    tracks: user.tracks || [],
                    stemHistory: user.stemHistory || [],
                    generatedLyrics: user.generatedLyrics || [],
                    personas: user.personas || [],
                    activityLog: user.activityLog || [],
                    totalSongsGenerated: user.totalSongsGenerated || 0,
                    totalCreditsUsed: user.totalUsed || 0,
                    settings: user.settings || {}
                }
            });
        }
        
        // POST - Kullanıcı verilerini kaydet
        if (req.method === 'POST') {
            const { action, data } = req.body;
            
            if (!action) {
                return res.status(400).json({ error: 'Action gerekli' });
            }
            
            let updateData = { updatedAt: new Date() };
            let pushData = {};
            
            switch (action) {
                // Yeni şarkı ekle
                case 'add_track':
                    if (!data.track) {
                        return res.status(400).json({ error: 'Track verisi gerekli' });
                    }
                    pushData.tracks = {
                        ...data.track,
                        addedAt: new Date()
                    };
                    break;
                
                // Şarkı sil
                case 'remove_track':
                    if (!data.trackId) {
                        return res.status(400).json({ error: 'Track ID gerekli' });
                    }
                    await usersCollection.updateOne(
                        { wixUserId: decoded.userId },
                        { 
                            $pull: { tracks: { id: data.trackId } },
                            $set: { updatedAt: new Date() }
                        }
                    );
                    return res.status(200).json({ success: true, message: 'Şarkı silindi' });
                
                // Tüm şarkıları güncelle (sync)
                case 'sync_tracks':
                    if (!Array.isArray(data.tracks)) {
                        return res.status(400).json({ error: 'Tracks array gerekli' });
                    }
                    updateData.tracks = data.tracks.map(t => ({
                        ...t,
                        syncedAt: new Date()
                    }));
                    break;
                
                // Stem geçmişi ekle
                case 'add_stem_history':
                    if (!data.stemResult) {
                        return res.status(400).json({ error: 'Stem result verisi gerekli' });
                    }
                    pushData.stemHistory = {
                        ...data.stemResult,
                        createdAt: new Date()
                    };
                    break;
                
                // Üretilen söz ekle
                case 'add_lyrics':
                    if (!data.lyrics) {
                        return res.status(400).json({ error: 'Lyrics verisi gerekli' });
                    }
                    pushData.generatedLyrics = {
                        ...data.lyrics,
                        createdAt: new Date()
                    };
                    break;
                
                // Persona ekle
                case 'add_persona':
                    if (!data.persona) {
                        return res.status(400).json({ error: 'Persona verisi gerekli' });
                    }
                    pushData.personas = {
                        ...data.persona,
                        createdAt: new Date()
                    };
                    break;
                
                // Activity log ekle
                case 'add_activity':
                    if (!data.activity) {
                        return res.status(400).json({ error: 'Activity verisi gerekli' });
                    }
                    // Son 100 log tut
                    const user = await usersCollection.findOne({ wixUserId: decoded.userId });
                    let activityLog = user?.activityLog || [];
                    activityLog.push({
                        ...data.activity,
                        timestamp: new Date()
                    });
                    // Son 100 kaydı tut
                    if (activityLog.length > 100) {
                        activityLog = activityLog.slice(-100);
                    }
                    updateData.activityLog = activityLog;
                    break;
                
                // Ayarları güncelle
                case 'update_settings':
                    if (!data.settings) {
                        return res.status(400).json({ error: 'Settings verisi gerekli' });
                    }
                    updateData['settings'] = data.settings;
                    break;
                
                // Tüm verileri senkronize et
                case 'full_sync':
                    if (data.tracks) updateData.tracks = data.tracks;
                    if (data.stemHistory) updateData.stemHistory = data.stemHistory;
                    if (data.generatedLyrics) updateData.generatedLyrics = data.generatedLyrics;
                    if (data.personas) updateData.personas = data.personas;
                    if (data.settings) updateData.settings = data.settings;
                    break;
                
                default:
                    return res.status(400).json({ error: 'Geçersiz action: ' + action });
            }
            
            // Güncelleme yap (kullanıcı yoksa oluştur)
            const updateQuery = { $set: updateData };
            if (Object.keys(pushData).length > 0) {
                updateQuery.$push = pushData;
            }
            
            const result = await usersCollection.updateOne(
                { wixUserId: decoded.userId },
                updateQuery,
                { upsert: true }  // Kullanıcı yoksa oluştur
            );
            
            console.log('User data update result:', result);
            
            // Güncel veriyi döndür
            const updatedUser = await usersCollection.findOne({ wixUserId: decoded.userId });
            
            return res.status(200).json({
                success: true,
                message: 'Veriler kaydedildi',
                data: {
                    tracks: updatedUser.tracks || [],
                    stemHistory: updatedUser.stemHistory || [],
                    generatedLyrics: updatedUser.generatedLyrics || [],
                    personas: updatedUser.personas || [],
                    activityLog: updatedUser.activityLog || []
                }
            });
        }
        
        return res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('User data error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
};
