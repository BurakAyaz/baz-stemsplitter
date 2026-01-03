// api/test-kie.js - KIE API'yi doğrudan sorgula
// URL: /api/test-kie?taskId=xxx

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { taskId } = req.query;
    
    if (!taskId) {
        return res.status(400).json({ error: 'taskId gerekli' });
    }

    try {
        console.log('Testing KIE API for taskId:', taskId);
        
        const kieUrl = `https://api.kie.ai/api/v1/vocal-removal/record-info?taskId=${taskId}`;
        console.log('KIE URL:', kieUrl);
        
        const response = await fetch(kieUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const kieData = await response.json();
        console.log('KIE Response:', JSON.stringify(kieData, null, 2));

        return res.status(200).json({
            taskId: taskId,
            kieResponse: kieData,
            hasData: !!kieData.data,
            status: kieData.data?.status,
            hasResponse: !!kieData.data?.response,
            vocalUrl: kieData.data?.response?.vocal_url || 'YOK',
            instrumentalUrl: kieData.data?.response?.instrumental_url || 'YOK'
        });

    } catch (error) {
        console.error('KIE test error:', error);
        return res.status(500).json({ error: error.message });
    }
};
