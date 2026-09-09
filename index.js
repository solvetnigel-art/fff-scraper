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

      const fullLink = link.startsWith('http') ? link : `https://www.fff.fr${link}`;

      // Extraction des noms d'équipes depuis le slug
      const matchSlug = link.split('/match/')[1] || '';
      const slugParts = matchSlug.replace(/^\d+-/, '').split('-');

      let homeTeam = 'Inconnu';
      let awayTeam = 'Inconnu';

      if (slugParts.length >= 2) {
        const mid = Math.floor(slugParts.length / 2);
        homeTeam = slugParts.slice(0, mid).join(' ').toUpperCase();
        awayTeam = slugParts.slice(mid).join(' ').toUpperCase();
      }

      // Extraction des logos dans l'élément ou ses parents
      const parentCard = el.closest('div, li, article, tr');
      const imgs = parentCard.find('img').map((_, img) => $(img).attr('src')).get();

      // Formater URLs de logos (ajouter le domaine si relatif)
      const formatLogo = (src) => {
        if (!src) return '';
        if (src.startsWith('http')) return src;
        return `https://www.fff.fr${src}`;
      };

      const homeLogo = formatLogo(imgs[0]);
      const awayLogo = formatLogo(imgs[1]);

      // Score ou Heure
      let scoreOrTime = rawText;
      let status = 'À VENIR';

      if (/^\d{2}$/.test(rawText)) {
        scoreOrTime = `${rawText[0]} - ${rawText[1]}`;
        status = 'TERMINÉ';
      } else if (rawText.includes(':') || rawText.includes('h')) {
        status = 'À VENIR';
      } else if (rawText.includes('-')) {
        status = 'TERMINÉ';
      }

      // Extraction de la compétition si présente à proximité
      const competition = parentCard.find('[class*="comp"], [class*="category"], .competition').text().trim() || 'Compétition Officielle';

      matches.push({
        homeTeam,
        awayTeam,
        homeLogo,
        awayLogo,
        scoreOrTime,
        status,
        competition,
        link: fullLink
      });
    });

    // Suppression des doublons
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
