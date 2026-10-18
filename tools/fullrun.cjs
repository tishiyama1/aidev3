// ?fast で十夜を最後まで自動で遊び、終わりの画面を撮る。
// NODE_PATH=$(npm root -g) node tools/fullrun.cjs <url> <outdir> [width]
const { chromium } = require('playwright');
const [url, out, width = '420'] = process.argv.slice(2);
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.click('#btn-new');
  let shots = 0;
  for (let i = 0; i < 2000; i++) {
    if (await page.locator('#end-again').isVisible().catch(() => false)) break;
    if (await page.locator('#sheet-next').isVisible().catch(() => false)) {
      if (shots < 3) await page.screenshot({ path: `${out}/wake-${shots++}.png`, fullPage: true });
      await page.click('#sheet-next');
    } else if (await page.locator('#btn-go').isEnabled().catch(() => false) && await page.locator('#night').isVisible()) {
      // 振り分けを毎回ランダムに変える:道のカードを押すか、そのまま進む
      const cards = await page.locator('.path').count();
      const r = Math.random();
      if (r < 0.4 && cards) await page.locator('.path').nth(Math.floor(Math.random() * cards)).click({ timeout: 1500 }).catch(() => {});
      await page.click('#btn-go', { timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/end.png`, fullPage: true });
  console.log(await page.locator('#sheet').innerText().catch(() => ''));
  await page.click('#end-title');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/title-after.png` });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
