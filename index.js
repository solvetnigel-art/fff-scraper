import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/scrape-fff', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Paramètre ?url= manquant' });
  }

  let browser = null;

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
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const interceptedData = [];

    // Écoute de l'ensemble du réseau XHR/Fetch/GraphQL
    page.on('response', async (response) => {
      const reqUrl = response.url();
      const status = response.status();

      if (status === 200) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            interceptedData.push({
              url: reqUrl,
              data: json
            });
          }
        } catch (e) {
          // Ignorer les flux non parseables
        }
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
    
    // Attendre que les appels réseau d'arrière-plan soient terminés
    await new Promise((r) => setTimeout(r, 5000));
    await browser.close();

    return res.status(200).json({
      success: true,
      totalInterceptedRequests: interceptedData.length,
      interceptedData: interceptedData
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Scraping:', error.message);
    return res.status(500).json({ error: 'Échec du scraping', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Alsace Network Interceptor démarré sur le port ${PORT}`);
});

