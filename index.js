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
    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    const matches = [];

    $('a[href*="/competition/match/"]').each((_, element) => {
      const el = $(element);
      const link = el.attr('href') || '';
      const rawText = el.text().trim();

      // Formater le lien complet
      const fullLink = link.startsWith('http') ? link : `https://www.fff.fr${link}`;

      // Extraction des noms d'équipes depuis le slug de l'URL
      // Exemple URL: .../match/56464473-s-c-selestat-a-s-canton-vert
      const matchSlug = link.split('/match/')[1] || '';
      const slugParts = matchSlug.replace(/^\d+-/, '').split('-');

      let homeTeam = 'Inconnu';
      let awayTeam = 'Inconnu';

      if (slugParts.length >= 2) {
        const mid = Math.floor(slugParts.length / 2);
        homeTeam = slugParts.slice(0, mid).join(' ').toUpperCase();
        awayTeam = slugParts.slice(mid).join(' ').toUpperCase();
      }

      // Formatage du score ou de l'heure à partir du texte
      let infoMatch = rawText;
      if (/^\d{2}$/.test(rawText)) {
        infoMatch = `${rawText[0]} - ${rawText[1]}`; // Transforme "31" en "3 - 1"
      }

      matches.push({
        homeTeam,
        awayTeam,
        scoreOrTime: infoMatch,
        link: fullLink
      });
    });

    // Suppression des doublons de liens
    const uniqueMatches = Array.from(new Set(matches.map(m => m.link)))
      .map(link => matches.find(m => m.link === link));

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
