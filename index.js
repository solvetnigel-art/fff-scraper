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
    const teams = [];

    // 1. Extraire la liste des équipes du club (colonne de droite sur le site FFF)
    $('a[href*="/equipe/"]').each((_, element) => {
      const el = $(element);
      const teamName = el.text().trim();
      const link = el.attr('href') || '';
      const logo = el.find('img').attr('src') || '';

      if (teamName && link) {
        teams.push({
          name: teamName,
          logo: logo.startsWith('http') ? logo : `https://www.fff.fr${logo}`,
          url: link.startsWith('http') ? link : `https://www.fff.fr${link}`
        });
      }
    });

    // Dédupliquer les équipes
    const uniqueTeams = Array.from(new Set(teams.map(t => t.url)))
      .map(url => teams.find(t => t.url === url));

    // 2. Extraire la liste des matchs présentés sur la page
    $('a[href*="/competition/match/"]').each((_, element) => {
      const el = $(element);
      const link = el.attr('href') || '';
      const rawText = el.text().trim();
      const fullLink = link.startsWith('http') ? link : `https://www.fff.fr${link}`;

      const matchSlug = link.split('/match/')[1] || '';
      const slugParts = matchSlug.replace(/^\d+-/, '').split('-');

      let homeTeam = 'INCONNU';
      let awayTeam = 'INCONNU';

      if (slugParts.length >= 2) {
        const mid = Math.floor(slugParts.length / 2);
        homeTeam = slugParts.slice(0, mid).join(' ').toUpperCase();
        awayTeam = slugParts.slice(mid).join(' ').toUpperCase();
      }

      let scoreOrTime = rawText;
      let status = 'À VENIR';

      if (/^\d{2}$/.test(rawText)) {
        scoreOrTime = `${rawText[0]} - ${rawText[1]}`;
        status = 'TERMINÉ';
      } else if (rawText.includes(':') || rawText.includes('h')) {
        status = 'À VENIR';
      }

      const parentBlock = el.closest('div, tr, li, article');
      const localImgs = parentBlock.find('img').map((_, img) => $(img).attr('src')).get();

      const homeLogo = localImgs[0] ? (localImgs[0].startsWith('http') ? localImgs[0] : `https://www.fff.fr${localImgs[0]}`) : '';
      const awayLogo = localImgs[1] ? (localImgs[1].startsWith('http') ? localImgs[1] : `https://www.fff.fr${localImgs[1]}`) : '';

      matches.push({
        homeTeam,
        awayTeam,
        homeLogo,
        awayLogo,
        scoreOrTime,
        status,
        link: fullLink
      });
    });

    const uniqueMatches = Array.from(new Set(matches.map(m => m.link)))
      .map(link => matches.find(m => m.link === link));

    return res.status(200).json({
      success: true,
      totalMatches: uniqueMatches.length,
      totalTeams: uniqueTeams.length,
      teams: uniqueTeams,
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

