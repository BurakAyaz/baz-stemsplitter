// api/generate-image.js - Kie.ai Nano Banana API Endpoint
module.exports = async (req, res) => {
  // CORS headers
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
    return res.status(500).json({ error: 'Sunucu hatası: API Key eksik.' });
  }

  try {
    const { prompt, aspectRatio, outputFormat } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gerekli.' });
    }

    // Kie.ai Nano Banana API format
    const payload = {
      model: "google/nano-banana",
      callBackUrl: "https://google.com",
      input: {
        prompt: prompt,
        output_format: outputFormat || "png",
        image_size: aspectRatio || "1:1"
      }
    };

    console.log("Nano Banana API - İstek:", JSON.stringify(payload, null, 2));

    // Kie.ai Unified Jobs API
    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log("Nano Banana API - Yanıt:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("Nano Banana API Hatası:", data);
      throw new Error(data.msg || data.error || JSON.stringify(data));
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Generate Image Proxy Hatası:", error);
    return res.status(500).json({ 
      error: 'Görsel oluşturma başlatılamadı', 
      details: error.message 
    });
  }
};
