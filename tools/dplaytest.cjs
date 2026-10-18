// 百人の迷宮を ?fast で最後まで自動で遊び、要所のスクリーンショットとエラーを集める。
// NODE_PATH=$(npm root -g) node tools/dplaytest.cjs <url> <outdir> [width]
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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: `${out}/00-title.png` });
  await page.click('#btn-new');
  await page.waitForTimeout(400);
  const shot = {};
  const snap = async (name) => { if (!shot[name]) { shot[name] = 1; await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); } };
  const vis = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  for (let i = 0; i < 3000; i++) {
    if (await vis('#end-again')) break;
    if (await vis('#camp-next')) {
      await snap('03-camp');
      if (await vis('#auto-equip')) await page.click('#auto-equip').catch(() => {});
      const acts = page.locator('.camp-actions button:not([disabled])');
      if (await acts.count()) {
        const pick = ['rest', 'train', 'pray'][i % 3];
        await page.click(`.camp-actions button[data-act="${pick}"]`).catch(() => {});
      }
      await page.click('#camp-next', { timeout: 1500 }).catch(() => {});
    } else if (await vis('.stances button')) {
      await snap('05-boss');
      await page.click('.stances button[data-s="attack"]', { timeout: 1500 }).catch(() => {});
    } else if (await vis('#btn-go') && await page.locator('#btn-go').isEnabled().catch(() => false)) {
      const label = await page.locator('#btn-go').textContent();
      if (label === '進む') {
        await snap('01-room');
        const cards = await page.locator('.path').count();
        if (cards && Math.random() < 0.5) await page.locator('.path').nth(Math.floor(Math.random() * cards)).click({ timeout: 1500 }).catch(() => {});
      } else if (label !== '予言を聞く') await snap('02-result');
      else await snap('06-prophecy');
      await page.click('#btn-go', { timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/09-end.png`, fullPage: true });
  console.log((await page.locator('#sheet').innerText().catch(() => '')).slice(0, 600));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
