// 百人の迷宮を最後まで自動で遊び、要所のスクリーンショットとエラー・描画速度を集める。
// NODE_PATH=$(npm root -g) node tools/dplaytest.cjs <url> <outdir> [width] [height]
//   url に ?fast を付けると演出が速くなる。
const { chromium } = require('playwright');
const [url, out, width = '400', height = '860'] = process.argv.slice(2);
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/00-title.png` });
  await page.click('#btn-new');
  await page.waitForTimeout(800);
  const shot = {};
  const snap = async (name) => { if (!shot[name]) { shot[name] = 1; await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${name}.png` }); } };
  const vis = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const enabled = (sel) => page.locator(sel).first().isEnabled().catch(() => false);
  let rooms = 0;
  for (let i = 0; i < 4000; i++) {
    if (await vis('#end-again')) break;
    if (await vis('#camp-next')) {
      await snap('03-camp');
      if (await vis('#auto-equip')) await page.click('#auto-equip').catch(() => {});
      if (await enabled('.act[data-act="rest"]')) {
        const pick = process.env.STRAT === 'safe' ? 'rest' : ['rest', 'train', 'pray'][i % 3];
        await page.click(`.act[data-act="${pick}"]`).catch(() => {});
      }
      if (await enabled('#camp-next')) await page.click('#camp-next', { timeout: 1500 }).catch(() => {});
    } else if (await vis('#btn-prophecy')) {
      await snap('06-prophecy-ready');
      await page.click('#btn-prophecy', { timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(300);
      await snap('07-prophecy');
    } else if (await vis('.stance')) {
      await snap('05-boss');
      const s = (await enabled('.stance.grace.suggest')) ? 'grace' : 'attack';
      await page.click(`.stance[data-s="${s}"]`, { timeout: 1500 }).catch(() => {});
    } else if (await vis('#btn-go') && await enabled('#btn-go')) {
      const label = (await page.locator('#btn-go').textContent()).trim();
      if (label === '進め') {
        rooms++;
        if (rooms === 1) await snap('01-room');
        if (rooms === 7) await snap('01b-room-deeper');
        if (rooms === 22) await snap('01c-room-deep');
        const cards = await page.locator('.plaque').count();
        if (process.env.STRAT === 'safe') {
          // 見込みが一番良い扉へ全員を送る(未知の扉は 70% とみなす)
          const ests = await page.locator('.plaque .p-est').allTextContents();
          let best = 0, bv = -1;
          ests.forEach((t, k) => { const m = t.match(/生還\s*(\d+)%/); const v = m ? Number(m[1]) : 70; if (v > bv) { bv = v; best = k; } });
          await page.locator('.plaque').nth(best).click({ timeout: 1500 }).catch(() => {});
        } else if (cards && Math.random() < 0.5) await page.locator('.plaque').nth(Math.floor(Math.random() * cards)).click({ timeout: 1500 }).catch(() => {});
        await page.click('#btn-go', { timeout: 1500 }).catch(() => {});
        if (rooms === 2) { await page.waitForTimeout(250); await snap('02a-entering'); }
      } else {
        await snap('02-result');
        await page.click('#btn-go', { timeout: 1500 }).catch(() => {});
      }
    }
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/09-end.png` });
  console.log((await page.locator('#sheet').innerText().catch(() => '')).slice(0, 500));
  // 描画速度(表紙の舞台で 2 秒間のフレーム数)
  await page.click('#end-title').catch(() => {});
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  console.log('FPS(表紙):', fps);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
