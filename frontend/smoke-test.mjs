// Headless render smoke test: loads the app served by the backend (single-port
// mode on :8000), waits for the graph to populate, captures console errors and a
// screenshot. Not part of the app — a one-off verification helper.
import puppeteer from "puppeteer-core";

const CHROME =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.APP_URL || "http://127.0.0.1:8000/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1400,900"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const errors = [];
const logs = [];
page.on("console", (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("requestfailed", (r) =>
  errors.push("requestfailed: " + r.url() + " " + r.failure()?.errorText)
);

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

// Wait for the force-graph canvas and for nodes to be reported in the status bar.
await page.waitForSelector("canvas", { timeout: 30000 });

// Poll the status bar text for "N papers" with N > 1.
let papers = 0;
for (let i = 0; i < 40; i++) {
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/(\d+)\s+papers/);
  papers = m ? Number(m[1]) : 0;
  const legend = /Clusters/.test(text);
  if (papers > 1 && legend) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const bodyText = await page.evaluate(() => document.body.innerText);
await page.screenshot({ path: "smoke-screenshot.png" });

console.log("=== SMOKE RESULT ===");
console.log("papers in status bar:", papers);
console.log("has 'Clusters' legend:", /Clusters/.test(bodyText));
console.log("has 'Trace lineage':", /Trace lineage/.test(bodyText));
console.log("has seed title 'Attention':", /Attention/.test(bodyText));
console.log("console errors:", errors.length);
errors.slice(0, 20).forEach((e) => console.log("  ERR:", e));
console.log("--- first 400 chars of body ---");
console.log(bodyText.slice(0, 400).replace(/\n+/g, " | "));

await browser.close();
process.exit(errors.length > 0 ? 2 : papers > 1 ? 0 : 3);
