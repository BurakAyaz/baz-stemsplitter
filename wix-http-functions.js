// Wix http-functions.js - GÜNCELLENMIŞ VERSİYON
// stemHistory array eklendi

import { ok, badRequest } from 'wix-http-functions';
import { authentication } from 'wix-members-backend';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
const { MongoClient } = require('mongodb');

export async function post_iyzico(request) {
    try {
        const body = await request.body.json();
        const email = (body.customerEmail || "").trim().toLowerCase();
        
        // 1. GÜVENLİK FİLTRESİ
        if (!email || email.length < 5) {
            return ok({ body: { "status": "error", "message": "Email adresi geçersiz." } });
        }

        // 2. ŞİFRE ÜRETİMİ (Make.com'a gidecek olan)
        const tempPassword = "Baz" + Math.random().toString(36).slice(-5) + "!"; 

        // 3. WIX ÜYE KAYDI
        let wixUserId = "";
        try {
            const registrationResult = await authentication.register(email, tempPassword, {
                contactInfo: { firstName: email.split('@')[0] }
            });
            wixUserId = registrationResult.member._id;
        } catch (regErr) {
            console.log("Wix Kayıt Hatası/Zaten Var:", regErr.message);
            
            // Kullanıcı zaten varsa, mevcut ID'yi almaya çalış
            try {
                const members = await wixData.query("Members/PrivateMembersData")
                    .eq("loginEmail", email)
                    .find();
                if (members.items.length > 0) {
                    wixUserId = members.items[0]._id;
                }
            } catch (e) {
                console.log("Mevcut üye ID alınamadı:", e.message);
            }
        }

        // 4. PLAN VE KREDİ HESAPLAMA
        const urunIsmi = (body.price || "").toLowerCase();
        let eklenenKredi = 100, planId = "temel", durationDays = 30;

        if (urunIsmi.includes('test') || urunIsmi.includes('deneme')) {
            planId = 'deneme'; eklenenKredi = 10000; durationDays = 1;
        } else if (urunIsmi.includes('uzman')) {
            planId = 'uzman'; eklenenKredi = 500; durationDays = 180;
        } else if (urunIsmi.includes('pro')) {
            planId = 'pro'; eklenenKredi = 1000; durationDays = 365;
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));

        // 5. MONGODB GÜNCELLEME (Tek Kayıt / Upsert)
        const mongoUri = await getSecret('MONGODB_URI');
        const client = new MongoClient(mongoUri);
        await client.connect();
        const db = client.db('bazai');

        await db.collection('users').updateOne(
            { email: email },
            { 
                $set: { 
                    wixUserId: wixUserId,
                    email: email,
                    planId: planId,
                    credits: eklenenKredi,
                    totalCredits: eklenenKredi,
                    subscriptionStatus: "active",
                    purchasedAt: now,
                    expiresAt: expiresAt,
                    updatedAt: now,
                    totalUsed: 0,
                    totalSongsGenerated: 0,
                    totalImagesGenerated: 0,
                    features: [],
                    allowedModels: [],
                    activityLog: [],
                    personas: []
                },
                $setOnInsert: {
                    createdAt: now,
                    tracks: [],
                    lyrics: [],
                    visuals: [],
                    stemHistory: [],  // STEM SEPARATOR İÇİN EKLENDİ
                    generatedLyrics: []
                }
            },
            { upsert: true }
        );
        
        await client.close();

        // 6. KRİTİK ADIM: MAKE.COM İÇİN VERİ ÇIKIŞI
        return ok({ 
            body: { 
                "status": "success", 
                "customerEmail": email, 
                "tempPassword": tempPassword,
                "plan": planId 
            } 
        });

    } catch (err) {
        return ok({ body: { "status": "error", "message": err.message } });
    }
}
