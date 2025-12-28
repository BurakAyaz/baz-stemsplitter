// api/status.js
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. Task ID'yi URL'den al
    const { taskId } = req.query;

    if (!taskId) {
        return res.status(400).json({ error: 'Task ID gerekli.' });
    }

    // 2. API Key Kontrolü
    if (!process.env.KIE_API_KEY) {
        return res.status(500).json({ error: 'API Key eksik (Vercel ayarlarını kontrol et).' });
    }

    try {
        // DOKÜMANTASYONA GÖRE DOĞRU ADRES:
        // GET /api/v1/generate/record-info?taskId=...
        const targetUrl = `https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`;
        
        console.log("Durum Sorgulanıyor:", targetUrl);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // 3. Hata Yönetimi
        if (!response.ok) {
            console.error("API Hatası:", data);
            throw new Error(data.msg || "Durum sorgulanamadı");
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Status Proxy Hatası:", error);
        return res.status(500).json({ error: error.message });
    }
};
