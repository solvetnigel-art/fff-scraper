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

    // Attendre que le JS de la ligue charge les matchs dans le DOM
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Petite pause de sécurité pour le rendu dynamique
    await new Promise(r => setTimeout(r, 2000));

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    const matches = [];
    const teams = [];

    // 1. Extraction des équipes (si présent dans le sous-menu ou la barre latérale)
    $('a[href*="equipe"], a[href*="scl="]').each((_, element) => {
      const el = $(element);
      const name = el.text().trim();
      const link = el.attr('href') || '';
      const logo = el.find('img').attr('src') || '';

      if (name && link && name.length < 40) {
        teams.push({
          name,
          logo: logo ? (logo.startsWith('http') ? logo : `https://alsace.fff.fr${logo}`) : '',
          url: link.startsWith('http') ? link : `https://alsace.fff.fr${link}`
        });
      }
    });

    // 2. Extraction des matchs (sélecteurs spécifiques aux ligues régionales FFF)
    $('a[href*="/match/"], a[href*="/matchs/"], .match-link, .agenda-match').each((_, element) => {
      const el = $(element);
      const link = el.attr('href') || '';
      const fullLink = link.startsWith('http') ? link : `https://alsace.fff.fr${link}`;

      const parentBlock = el.closest('div, li, tr, article, .match');
      const textBlock = parentBlock.text().replace(/\s+/g, ' ').trim();

      // Extraction des logos dans le bloc du match
      const imgs = parentBlock.find('img').map((_, img) => $(img).attr('src')).get();
      const formatLogo = (src) => {
        if (!src) return '';
        return src.startsWith('http') ? src : `https://alsace.fff.fr${src}`;
      };

      // Recherche des noms d'équipes et scores/heures
      const teamsInBlock = parentBlock.find('.club-title, .equipe, .team-name').map((_, t) => $(t).text().trim()).get();
      
      let homeTeam = teamsInBlock[0] || 'DOMICILE';
      let awayTeam = teamsInBlock[1] || 'EXTÉRIEUR';
      let scoreOrTime = parentBlock.find('.score, .time, .hour').text().trim() || 'À VENIR';
      let status = scoreOrTime.includes('-') ? 'TERMINÉ' : 'À VENIR';

      matches.push({
        homeTeam,
        awayTeam,
        homeLogo: formatLogo(imgs[0]),
        awayLogo: formatLogo(imgs[1]),
        scoreOrTime,
        status,
        rawDetails: textBlock,
        link: fullLink
      });
    });

    // Dédupliquer
    const uniqueTeams = Array.from(new Set(teams.map(t => t.url))).map(u => teams.find(t => t.url === u));
    const uniqueMatches = Array.from(new Set(matches.map(m => m.link))).map(l => matches.find(m => m.link === l));

    return res.status(200).json({
      success: true,
      totalTeams: uniqueTeams.length,
      totalMatches: uniqueMatches.length,
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
  console.log(`Scraper Alsace FFF démarré sur le port ${PORT}`);
});
