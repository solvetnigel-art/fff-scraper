import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';

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

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Attendre le chargement des éléments de match dans le DOM
    await page.waitForSelector('a[href*="/competition/"]', { timeout: 10000 }).catch(() => null);

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    const matches = [];

    // Recherche de tous les liens ou blocs contenant des informations de matchs
    $('a[href*="/competition/res_match"], .match-card, .ping-match-card, div[class*="match"]').each((_, element) => {
      const el = $(element);

      const textContent = el.text().replace(/\s+/g, ' ').trim();
      
      // Extraction des liens et images
      const homeLogo = el.find('img').first().attr('src') || '';
      const awayLogo = el.find('img').last().attr('src') || '';
      const matchLink = el.attr('href') || '';

      if (textContent.length > 5 && (textContent.includes('-') || textContent.includes(':'))) {
        matches.push({
          rawText: textContent,
          homeLogo,
          awayLogo,
          link: matchLink.startsWith('http') ? matchLink : `https://www.fff.fr${matchLink}`
        });
      }
    });

    // Sécuriser les doublons
    const uniqueMatches = Array.from(new Set(matches.map(m => m.rawText)))
      .map(rawText => matches.find(m => m.rawText === rawText));

    return res.status(200).json({
      success: true,
      total: uniqueMatches.length,
      data: uniqueMatches
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Scraping:', error.message);
    return res.status(500).json({ error: 'Échec du scraping', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Puppeteer + Cheerio démarré sur le port ${PORT}`);
});

