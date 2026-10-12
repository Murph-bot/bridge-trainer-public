// Headless browser check against `vite preview` (built dist) on a free port: npm run smoke
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { chromium } from "playwright";

const OUT = ".eval-out";
mkdirSync(OUT, { recursive: true });
if (!existsSync("dist/index.html")) spawnSync("npx", ["vite", "build"], { stdio: "inherit" });

const port = await new Promise((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 100; i++) {
  if (await fetch(url).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

let failed = false;
const ok = (cond, msg) => {
  if (!cond) {
    failed = true;
    console.error("FAIL", msg);
  } else console.log("ok  ", msg);
};
const errors = [];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const settled = () => page.waitForFunction(() => document.querySelector('[data-testid="progress"]')?.style.display === "none", null, { timeout: 180000 });
  const sampleN = async () => Number((await tid("sample-n").first().textContent())?.trim());
  const forbidden = /τιμή|τιμές|Αντιμπίντ/i;

  await page.goto(url);
  await tid("hand-input").waitFor();
  ok((await page.locator("html").getAttribute("lang")) === "el", "Greek by default");
  const h2 = (await page.locator("h2").first().textContent()) ?? "";
  ok(/[Α-Ωα-ωά-ώ]{4,}/.test(h2), `Greek label renders: "${h2.trim()}"`);
  ok(!forbidden.test(await page.locator("body").innerText()), "no forbidden words (page)");

  // Sample hand (our own): West leads against 1NT-3NT by South; South deals so the auction reads 1NT P 3NT P P P.
  await tid("dealer-select").selectOption("S");
  await tid("hand-input").fill("S:K9 H:Q8642 D:AJ73 C:85");
  await tid("auction-input").fill("1N P 3N P P P");
  ok((await tid("contract-line").textContent())?.includes("3"), "problem accepted: contract line shows 3");
  await tid("lead-KS").click();
  await tid("rating").waitFor({ timeout: 120000 });
  await settled();
  const rating = (await tid("rating").first().textContent())?.trim() ?? "";
  ok(/^\d+%$/.test(rating), `rating visible: ${rating}`);
  const n = await sampleN();
  ok(n >= 200, `deals analysed: ${n}`);
  ok(!forbidden.test(await page.locator("body").innerText()), "no forbidden words (results)");
  await page.screenshot({ path: `${OUT}/smoke-el.png`, fullPage: true });

  await tid("lang-en").click();
  ok((await page.locator("html").getAttribute("lang")) === "en", "English toggle");
  const h2en = (await page.locator("h2").first().textContent()) ?? "";
  ok(h2en.includes("Problem"), `English label renders: "${h2en.trim()}"`);
  await tid("random-btn").click();
  ok((await tid("random-info").count()) === 1, "random problem generated");
  const lead = page.locator('[data-testid^="lead-"]:not([data-testid^="lead-row"]):not([data-testid="lead-hint"]):not([data-testid="lead-table"])').first();
  await lead.click();
  await tid("rating").waitFor({ timeout: 120000 });
  await settled();
  const n2 = await sampleN();
  ok(n2 >= 200, `random problem analysed with ${n2} deals`);
  await page.screenshot({ path: `${OUT}/smoke-en.png`, fullPage: true });

  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  failed = true;
  console.error("FAIL", e);
} finally {
  await browser.close();
  preview.kill();
}
process.exit(failed ? 1 : 0);
