import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

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
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 1. Accéder à la page
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 2000));

    // 2. Cliquer sur le bouton d'acceptation des cookies (RGPD FFF)
    try {
      const accepted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const acceptBtn = buttons.find((b) => {
          const txt = b.innerText ? b.innerText.toLowerCase() : '';
          return txt.includes('agree and close') || txt.includes('accepter') || txt.includes('continuer sans accepter');
        });
        if (acceptBtn) {
          acceptBtn.click();
          return true;
        }
        return false;
      });
      if (accepted) console.log('Bannière de cookies FFF acceptée !');
    } catch (e) {
      console.log('Bannière cookies non trouvée ou déjà fermée');
    }

    // 3. Attendre que le composant charge les matchs après validation des cookies
    await new Promise((r) => setTimeout(r, 6000));
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise((r) => setTimeout(r, 2000));

    // 4. Extraire la liste des matchs (Shadow DOM & liens de compétition)
    const matchesData = await page.evaluate(() => {
      function getAllElements(root = document) {
        let nodes = Array.from(root.querySelectorAll('*'));
        let shadowNodes = [];
        for (let node of nodes) {
          if (node.shadowRoot) {
            shadowNodes = shadowNodes.concat(getAllElements(node.shadowRoot));
          }
        }
        return nodes.concat(shadowNodes);
      }

      const allElements = getAllElements();
      const extracted = [];

      allElements.forEach((el) => {
        if (el.tagName === 'A' && el.href && (el.href.includes('match_id=') || el.href.includes('competition_id='))) {
          let parent = el.parentElement;
          let depth = 0;
          while (parent && depth < 5) {
            const txt = parent.innerText ? parent.innerText.replace(/\s+/g, ' ').trim() : '';
            if (txt.length > 20) {
              extracted.push({
                matchUrl: el.href,
                details: txt
              });
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
        }
      });

      return extracted;
    });

    await browser.close();

    // Nettoyage et déduplication
    const uniqueMatches = Array.from(new Set(matchesData.map((m) => m.matchUrl)))
      .map((url) => matchesData.find((m) => m.matchUrl === url));

    return res.status(200).json({
      success: true,
      totalMatches: uniqueMatches.length,
      matches: uniqueMatches
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Scraper Cookies/Matches:', error.message);
    return res.status(500).json({ error: 'Échec du scraping', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper FFF avec contournement Cookie RGPD prêt sur le port ${PORT}`);
});

