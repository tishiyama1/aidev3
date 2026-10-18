// ブラウザで一晩を通して遊び、各場面のスクリーンショットとエラーを集める。
// NODE_PATH=$(npm root -g) node tools/playtest.cjs <url> <outdir> [width]
const { chromium } = require('playwright');
const [url, out, width = '420'] = process.argv.slice(2);
const fs = require('fs');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.screenshot({ path: `${out}/00-title.png` });
  await page.click('#btn-new');
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${out}/01-night.png`, fullPage: true });
  // 帯の仕切りを右へ動かす
  const box = await page.locator('#strip').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height - 8, { steps: 5 });
  await page.mouse.up();
  await page.screenshot({ path: `${out}/02-dragged.png`, fullPage: true });
  let n = 0;
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#overlay').isVisible()) break;
    const go = page.locator('#btn-go');
    if (await go.isEnabled()) {
      await go.click();
      n++;
      await page.waitForTimeout(700);
      if (n === 2) await page.screenshot({ path: `${out}/03-resolving.png`, fullPage: true });
    }
    await page.waitForTimeout(1200);
    if (n === 3) await page.screenshot({ path: `${out}/04-stage.png`, fullPage: true });
  }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/05-wake.png`, fullPage: true });
  const sheet = await page.locator('#sheet').innerText().catch(() => '');
  console.log('SHEET:\n' + sheet.slice(0, 1200));
  await page.click('#sheet-next').catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/06-night2.png`, fullPage: true });
  // 一人を調べる
  const cb = await page.locator('#crowd').boundingBox();
  await page.mouse.click(cb.x + 12, cb.y + 12);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/07-inspect.png` });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
