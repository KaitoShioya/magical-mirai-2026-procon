// グラフィック負荷検証: Playwright で prototype.html の毎秒フレーム数を計測する。
// デスクトップと、モバイル相当（小ビューポート＋CPUスロットリング）で測る。
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5174";
const errors = [];

async function measure(page, label, seconds = 5) {
  await page.waitForTimeout(1500); // ウォームアップ
  await page.evaluate(() => window.__resetFps && window.__resetFps());
  await page.waitForTimeout(seconds * 1000);
  const avg = await page.evaluate(() => (window.__avgFps ? window.__avgFps() : -1));
  const last = await page.evaluate(() => (window.__fps ? window.__fps() : -1));
  console.log(`[${label}] avgFps=${avg.toFixed(1)} lastFps=${last}`);
  return avg;
}

const browser = await chromium.launch();

// --- デスクトップ ---
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("desktop: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("desktop console: " + m.text());
  });
  await page.goto(BASE + "/prototype.html?refl=512&bloomScale=0.5&points=300", { waitUntil: "load" });
  await measure(page, "desktop default(refl512 bloom0.5 pts300)", 5);
  await page.screenshot({ path: "scripts/proto-desktop.png" });
  await ctx.close();
}

// --- モバイル相当 + CPU 6倍スロットリング ---
async function mobileRun(query, label, rate = 6) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("mobile: " + e.message));
  const client = await ctx.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate });
  await page.goto(BASE + "/prototype.html?" + query, { waitUntil: "load" });
  const avg = await measure(page, label, 6);
  await page.screenshot({ path: "scripts/proto-mobile-" + label.replace(/[^a-z0-9]+/gi, "_") + ".png" });
  await ctx.close();
  return avg;
}

await mobileRun("refl=512&bloomScale=0.5&points=300", "mobile_x6_default", 6);
await mobileRun("refl=256&bloomScale=0.4&points=300&dpr=2", "mobile_x6_light", 6);
await mobileRun("refl=0&bloom=1&bloomScale=0.4&points=300&dpr=2", "mobile_x6_noreflect", 6);

if (errors.length) console.log("CONSOLE/PAGE ERRORS:\n" + errors.join("\n"));
else console.log("no page errors");

await browser.close();
