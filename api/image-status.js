// api/image-status.js - Kie.ai Nano Banana Task Status API Endpoint
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Sadece GET isteği kabul edilir.' });
  }

  if (!process.env.KIE_API_KEY) {
    return res.status(500).json({ error: 'Sunucu hatası: API Key eksik.' });
  }

  try {
    const { taskId } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId parametresi gerekli.' });
    }

    // Kie.ai Nano Banana - recordInfo endpoint for task status
    const response = await fetch(`https://api.kie.ai/api/v1/playground/recordInfo?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    console.log("Nano Banana Status API - Yanıt:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("Nano Banana Status API Hatası:", data);
      throw new Error(data.msg || data.error || JSON.stringify(data));
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Image Status Proxy Hatası:", error);
    return res.status(500).json({ 
      error: 'Durum sorgulanamadı', 
      details: error.message 
    });
  }
};
