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

    // Parsing du HTML avec Cheerio
    const $ = cheerio.load(html);
    const matches = [];

    $('.match-link, .ping-match-card, .match-result').each((_, element) => {
      const match = $(element);
      
      const homeTeam = match.find('.home-team, .equipe-domicile, .team-name').first().text().trim();
      const awayTeam = match.find('.away-team, .equipe-exterieur, .team-name').last().text().trim();
      const score = match.find('.score, .match-score').text().trim();
      const date = match.find('.date, .match-date').text().trim();
      const homeLogo = match.find('img').first().attr('src') || '';
      const awayLogo = match.find('img').last().attr('src') || '';

      if (homeTeam || awayTeam) {
        matches.push({
          homeTeam,
          awayTeam,
          score,
          date,
          homeLogo,
          awayLogo
        });
      }
    });

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
