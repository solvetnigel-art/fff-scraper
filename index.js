import express from 'express';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/scrape-fff', async (req, res) => {
  const { url, scl } = req.query;

  // Récupérer le code SCL (ex: 255) soit depuis le paramètre ?scl= soit extrait de l'URL ?url=
  let clubId = scl || '255';
  if (url && url.includes('scl=')) {
    const match = url.match(/scl=(\d+)/);
    if (match) clubId = match[1];
  }

  try {
    // 1. Appel direct à l'API interne officielle de la FFF
    const fffApiUrl = `https://api.fff.fr/api/clubs/${clubId}/matchs`;
    
    const response = await fetch(fffApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://alsace.fff.fr',
        'Referer': 'https://alsace.fff.fr/'
      }
    });

    if (!response.ok) {
      // Tentative de fallback sur l'endpoint agenda alternatif de la FFF
      const fallbackUrl = `https://api.fff.fr/api/clubs/${clubId}/agenda`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://alsace.fff.fr',
          'Referer': 'https://alsace.fff.fr/'
        }
      });
      
      if (!fallbackRes.ok) {
        return res.status(fallbackRes.status).json({
          error: `L'API FFF a répondu avec le statut ${fallbackRes.status}`
        });
      }

      const fallbackData = await fallbackRes.json();
      return res.status(200).json({
        success: true,
        source: 'API FFF Agenda Direct',
        clubId,
        rawApiData: fallbackData
      });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      source: 'API FFF Matchs Direct',
      clubId,
      rawApiData: data
    });

  } catch (error) {
    console.error('Erreur API FFF Direct:', error.message);
    return res.status(500).json({ error: 'Échec de la récupération API FFF', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Proxy FFF Direct démarrée sur le port ${PORT}`);
});
