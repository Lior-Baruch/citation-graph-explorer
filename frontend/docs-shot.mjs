// One-off: capture a settled screenshot for the README into ../docs/screenshot.png
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
mkdirSync("../docs", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1600,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("canvas", { timeout: 30000 });

// Wait until the graph has papers, then let the force layout settle.
for (let i = 0; i < 40; i++) {
  const t = await page.evaluate(() => document.body.innerText);
  if (/(\d+)\s+papers/.test(t) && Number(RegExp.$1) > 1) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 9000)); // settle layout

await page.screenshot({ path: "../docs/screenshot.png" });
console.log("saved ../docs/screenshot.png");
await browser.close();
