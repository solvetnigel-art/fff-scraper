import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/scrape-fff', async (req, res) => {
  const { url } = req.query;

  const targetUrl = url || 'https://alsace.fff.fr/recherche-clubs?subtab=agenda&tab=resultats&scl=255';

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

    // Charger la page racine de la ligue
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 5000));

    // Récupérer le HTML de la page principale ET de toutes les iFrames injectées
    const frames = page.frames();
    let combinedHtml = await page.content();

    for (const frame of frames) {
      try {
        const frameHtml = await frame.content();
        combinedHtml += '\n' + frameHtml;
      } catch (e) {
        // Ignorer les frames inaccessibles
      }
    }

    await browser.close();

    // Analyse du HTML combiné avec Cheerio
    const $ = cheerio.load(combinedHtml);
    const matches = [];

    // Détecter tous les liens pointant vers des matchs de compétition
    $('a[href*="match_id="], a[href*="/competitions/"]').each((_, element) => {
      const el = $(element);
      const link = el.attr('href') || '';
      
      // Remonter au bloc parent du match
      const parentBlock = el.closest('tr, li, article, div[class*="match"], div');
      const textBlock = parentBlock.text().replace(/\s+/g, ' ').trim();

      // Extraire les images/logos dans le bloc
      const imgs = parentBlock.find('img').map((_, img) => {
        const src = $(img).attr('src') || '';
        return src.startsWith('http') ? src : `https://alsace.fff.fr${src}`;
      }).get();

      if (textBlock && textBlock.length > 10) {
        matches.push({
          details: textBlock,
          link: link.startsWith('http') ? link : `https://alsace.fff.fr${link}`,
          logos: imgs
        });
      }
    });

    // Dédupliquer les matchs selon leur lien
    const uniqueMatches = Array.from(new Set(matches.map((m) => m.link)))
      .map((l) => matches.find((m) => m.link === l));

    return res.status(200).json({
      success: true,
      totalMatches: uniqueMatches.length,
      data: uniqueMatches
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Scraping iFrame:', error.message);
    return res.status(500).json({ error: 'Échec du scraping iFrame', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Alsace iFrame support démarré sur le port ${PORT}`);
});

