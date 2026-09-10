import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/scrape-fff', async (req, res) => {
  const { url } = req.query;
  const targetUrl = url || 'https://alsace.fff.fr/recherche-clubs?subtab=agenda&tab=resultats&scl=255';

  let browser = null;
  let capturedMatches = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Ecouteur réseau : Capture automatique des réponses API contenant les matchs
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('/api/') || responseUrl.includes('matchs') || responseUrl.includes('agenda')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            // Si le JSON contient une liste ou des données de matchs
            if (json && (Array.isArray(json) || json.items || json.matchs || json.data)) {
              capturedMatches = json;
              console.log(' Données JSON des matchs interceptées avec succès !');
            }
          }
        } catch (e) {
          // Ignorer les réponses non-JSON
        }
      }
    });

    // Charger la page
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 40000 });

    // Fermer les cookies si présents
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.innerText && b.innerText.toLowerCase().includes('close'));
        if (btn) btn.click();
      });
    } catch (e) {}

    // Attendre 6 secondes le chargement des requêtes XHR/Fetch
    await new Promise((r) => setTimeout(r, 6000));

    await browser.close();

    if (capturedMatches) {
      return res.status(200).json({
        success: true,
        method: 'Network Interception',
        data: capturedMatches
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Aucun flux JSON de matchs n\'a été capturé durant le chargement.'
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Interception:', error.message);
    return res.status(500).json({ error: 'Échec de l\'interception réseau', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper par Interception Réseau FFF prêt sur le port ${PORT}`);
});

