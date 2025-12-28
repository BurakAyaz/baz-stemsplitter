// api/get-image.js - Task ID ile Kie.ai'den görsel bilgisi al
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    if (!process.env.KIE_API_KEY) {
        return res.status(500).json({ error: 'API Key missing' });
    }
    
    try {
        const { taskId } = req.query;
        
        if (!taskId) {
            return res.status(400).json({ error: 'taskId required' });
        }
        
        // Kie.ai recordInfo endpoint'inden görsel bilgisini al
        const response = await fetch(`https://api.kie.ai/api/v1/playground/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        console.log('Kie.ai get-image response:', JSON.stringify(data, null, 2));
        
        if (!response.ok) {
            throw new Error(data.msg || data.error || 'Kie.ai API error');
        }
        
        // Görsel URL'sini çıkar
        let imageUrl = null;
        let status = 'unknown';
        
        if (data.code === 200 && data.data) {
            const d = data.data;
            status = (d.status || d.state || '').toLowerCase();
            
            // Farklı response yapılarını kontrol et
            imageUrl = d.response?.images?.[0] ||
                      d.response?.imageUrl ||
                      d.response?.image_url ||
                      d.imageUrl ||
                      d.image_url ||
                      d.output?.image_url ||
                      d.output?.images?.[0] ||
                      d.result?.image_url ||
                      d.result?.images?.[0] ||
                      (d.images && d.images[0]);
        }
        
        return res.status(200).json({
            success: true,
            taskId: taskId,
            status: status,
            imageUrl: imageUrl,
            raw: data.data // Debug için
        });
        
    } catch (error) {
        console.error('Get image error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
