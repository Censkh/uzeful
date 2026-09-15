import fs from 'node:fs/promises';
const { chromium } = await import(process.argv[2] || 'playwright');

const source = 'website/static/img/uzeful-social-card.svg';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${await fs.readFile(source, 'utf8')}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('body > svg').screenshot({ path: source.replace('.svg', '.png') });
} finally {
  await browser.close();
}
