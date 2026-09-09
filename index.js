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

    // Attendre que la page charge au moins un lien de compétition/match
    await page.waitForSelector('a[href*="/competition/"]', { timeout: 10000 }).catch(() => null);

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    const matches = [];

    // On cible tous les conteneurs ou liens vers un match FFF
    $('a[href*="/competition/res_match"], a[href*="/match/"], .ping-match-card, div[class*="match-card"]').each((_, element) => {
      const el = $(element);

      // Récupérer les images (logos des clubs)
      const imgs = el.find('img').map((_, img) => $(img).attr('src')).get();
      const homeLogo = imgs[0] || '';
      const awayLogo = imgs[1] || '';

      const matchLink = el.attr('href') || '';
      const fullText = el.text().replace(/\s+/g, ' ').trim();

      // Extraction propre par regex si tout est concaténé dans le texte
      // Exemple de texte FFF : "sam 05 sep 2026 - 13h00 Fém U13 D2 Alsace SELESTAT S.C 3 1 CANTON VERT A.S."
      const dateMatch = fullText.match(/(sam|dim|lun|mar|mer|jeu|ven)\s+\d{2}\s+[a-z]{3}\s+\d{4}\s*-\s*\d{2}h\d{2}/i);
      const date = dateMatch ? dateMatch[0] : '';

      matches.push({
        date,
        rawText: fullText,
        homeLogo,
        awayLogo,
        link: matchLink.startsWith('http') ? matchLink : `https://www.fff.fr${matchLink}`
      });
    });

    // Nettoyage des doublons basés sur le texte brut
    const uniqueMatches = [];
    const seenText = new Set();

    for (const match of matches) {
      if (match.rawText && !seenText.has(match.rawText)) {
        seenText.add(match.rawText);
        uniqueMatches.push(match);
      }
    }

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


