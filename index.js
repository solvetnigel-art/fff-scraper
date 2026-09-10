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

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise((r) => setTimeout(r, 4000));

    const result = await page.evaluate(() => {
      const matches = [];
      const teams = [];

      function querySelectorAllDeep(selector, root = document) {
        let elements = Array.from(root.querySelectorAll(selector));
        const children = Array.from(root.querySelectorAll('*'));
        for (const child of children) {
          if (child.shadowRoot) {
            elements = elements.concat(querySelectorAllDeep(selector, child.shadowRoot));
          }
        }
        return elements;
      }

      // Extraction des blocs de matchs
      const cards = querySelectorAllDeep('article, div[class*="match"], li[class*="match"], div[class*="agenda"]');
      
      cards.forEach((card) => {
        const text = card.innerText ? card.innerText.replace(/\s+/g, ' ').trim() : '';
        const imgs = Array.from(card.querySelectorAll('img')).map((img) => img.src);
        const linkEl = card.querySelector('a[href*="match"]');
        const link = linkEl ? linkEl.href : '';

        if (text && text.length > 15 && (text.includes(':') || text.includes('-'))) {
          matches.push({
            details: text,
            logos: imgs,
            link: link
          });
        }
      });

      // Extraction des équipes
      const teamLinks = querySelectorAllDeep('a[href*="equipe"], a[href*="scl="]');
      teamLinks.forEach((a) => {
        const name = a.innerText.trim();
        if (name && name.length > 2 && name.length < 50) {
          teams.push({
            name: name,
            url: a.href
          });
        }
      });

      return { matches, teams };
    });

    await browser.close();

    const uniqueTeams = Array.from(new Set(result.teams.map((t) => t.url)))
      .map((u) => result.teams.find((t) => t.url === u));

    return res.status(200).json({
      success: true,
      totalTeams: uniqueTeams.length,
      totalMatches: result.matches.length,
      teams: uniqueTeams,
      data: result.matches
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Scraping:', error.message);
    return res.status(500).json({ error: 'Échec du scraping', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Alsace Agenda démarré sur le port ${PORT}`);
});
