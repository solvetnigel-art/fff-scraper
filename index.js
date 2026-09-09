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

    // Cibler directement les cartes/lignes de matchs dans le calendrier
    $('.ping-match-card, .match-card, .match, [class*="match-row"]').each((_, element) => {
      const el = $(element);

      const date = el.find('.date, .match-date, [class*="date"]').first().text().trim();
      const competition = el.find('.competition, .match-comp, [class*="comp"]').first().text().trim();
      const homeTeam = el.find('.equipe-dom, .home-team, [class*="home"]').first().text().trim();
      const awayTeam = el.find('.equipe-ext, .away-team, [class*="away"]').first().text().trim();
      const score = el.find('.score, .match-score, [class*="score"]').first().text().trim();

      const homeLogo = el.find('img').first().attr('src') || '';
      const awayLogo = el.find('img').last().attr('src') || '';

      if (date || homeTeam || awayTeam) {
        matches.push({
          date,
          competition,
          homeTeam,
          score,
          awayTeam,
          homeLogo,
          awayLogo
        });
      }
    });

    // Si le conteneur spécifique n'a pas séparé les blocs, analyser le conteneur principal
    if (matches.length === 0) {
      $('a[href*="/competition/res_match"]').each((_, element) => {
        const el = $(element);
        const text = el.text().replace(/\s+/g, ' ').trim();
        const link = el.attr('href') || '';

        matches.push({
          rawMatch: text,
          link: link.startsWith('http') ? link : `https://www.fff.fr${link}`
        });
      });
    }

    return res.status(200).json({
      success: true,
      total: matches.length,
      data: matches
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

