import express from 'express';
import axios from 'axios';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 10000;

// Agent HTTPS qui force la résolution IPv4 et ignore les erreurs SSL strictes
const agent = new https.Agent({
  rejectUnauthorized: false,
  family: 4
});

app.get('/scrape-fff', async (req, res) => {
  const { url, scl } = req.query;

  let clubId = scl || '255';
  if (url && url.includes('scl=')) {
    const match = url.match(/scl=(\d+)/);
    if (match) clubId = match[1];
  }

  const fffEndpoints = [
    `https://api.fff.fr/api/clubs/${clubId}/matchs`,
    `https://api.fff.fr/api/clubs/${clubId}/agenda`,
    `https://api-v2.fff.fr/api/clubs/${clubId}/matchs`
  ];

  for (const endpoint of fffEndpoints) {
    try {
      const response = await axios.get(endpoint, {
        httpsAgent: agent,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://alsace.fff.fr',
          'Referer': 'https://alsace.fff.fr/'
        }
      });

      if (response.data) {
        return res.status(200).json({
          success: true,
          source: endpoint,
          clubId,
          data: response.data
        });
      }
    } catch (err) {
      console.log(`Échec sur l'endpoint ${endpoint} : ${err.message}`);
    }
  }

  return res.status(500).json({
    error: 'Impossible de joindre les endpoints de l\'API FFF',
    details: 'Toutes les tentatives de connexions ont échoué.'
  });
});

app.listen(PORT, () => {
  console.log(`API Proxy FFF Axios démarrée sur le port ${PORT}`);
});
