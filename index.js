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

    // Charger la page
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 40000 });
    
    // Attendre 6 secondes que le composant FFF charge son Shadow DOM
    await new Promise((r) => setTimeout(r, 6000));

    // Déplacer le scroll pour forcer le lazy-loading
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise((r) => setTimeout(r, 2000));

    // Fonction d'extraction traversant le Shadow DOM
    const data = await page.evaluate(() => {
      // Traverse récursivement les Shadow Roots
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
      const matchesFound = [];

      // Parcourir tous les liens trouvés même dans le Shadow DOM
      allElements.forEach(el => {
        if (el.tagName === 'A' && el.href) {
          const href = el.href;
          if (href.includes('match_id=') || href.includes('competition_id=')) {
            // Remonter au bloc conteneur du match
            let parent = el.parentElement;
            let count = 0;
            while (parent && count < 4) {
              const txt = parent.innerText ? parent.innerText.replace(/\s+/g, ' ').trim() : '';
              if (txt.length > 20) {
                matchesFound.push({
                  link: href,
                  content: txt
                });
                break;
              }
              parent = parent.parentElement;
              count++;
            }
          }
        }
      });

      // Extraire l'intégralité du texte rendu visuellement dans tous les Shadow Roots
      const fullText = allElements
        .map(el => el.innerText)
        .filter(Boolean)
        .join(' ');

      return {
        matchesFound,
        fullTextSnippet: fullText.substring(0, 4000)
      };
    });

    await browser.close();

    // Dédupliquer les résultats par lien
    const uniqueMatches = Array.from(new Set(data.matchesFound.map(m => m.link)))
      .map(link => data.matchesFound.find(m => m.link === link));

    return res.status(200).json({
      success: true,
      totalMatches: uniqueMatches.length,
      matches: uniqueMatches,
      rawShadowTextSample: data.fullTextSnippet
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur Deep Shadow DOM:', error.message);
    return res.status(500).json({ error: 'Échec de l\'extraction Shadow DOM', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Shadow DOM FFF prêt sur le port ${PORT}`);
});

