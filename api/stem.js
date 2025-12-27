// api/stem.js - Vocal & Instrument Stem Separation API Endpoint
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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

    // 4. Kie.ai'ye gidecek paketi hazırlıyoruz
    const payload = {
      taskId: taskId,
      audioId: audioId,
      type: type,
      callBackUrl: callBackUrl || "https://google.com"
    };

    console.log("Stem API - Kie.ai'ye giden istek:", payload);

    // 5. Kie.ai API İsteği - Vocal Separation endpoint
    const response = await fetch('https://api.kie.ai/api/v1/vocal-removal/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // 6. Hata Kontrolü
    if (!response.ok) {
      console.error("Stem API Hatası:", data);
      throw new Error(data.msg || data.error || JSON.stringify(data));
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Stem Proxy Hatası:", error);
    return res.status(500).json({ 
      error: 'Stem ayrıştırma işlemi başlatılamadı', 
      details: error.message 
    });
  }
}
