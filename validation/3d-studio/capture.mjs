// Reproducible Studio 3D captures: same example project, same cameras, real app.
//   node validation/3d-studio/capture.mjs <label> [baseURL]
// Requires a running dev server (default http://localhost:3000). Writes PNGs and
// a metrics JSON to validation/3d-studio/<label>/. Read-only for project data.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const label = process.argv[2] ?? "capture", base = process.argv[3] ?? "http://localhost:3000";
const out = path.resolve("validation/3d-studio", label); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const metrics = {};
for (const [name, viewport, mobile] of [["desktop-1440", { width: 1440, height: 900 }, false], ["mobile-375", { width: 375, height: 812 }, true]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  const started = Date.now();
  await page.getByRole("button", { name: "Abrir exemplo completo de pré-projeto" }).click();
  const canvas = page.getByRole("img", { name: "Modelo 3D da estrutura" });
  await canvas.waitFor({ state: "visible", timeout: 120000 });
  await page.waitForFunction(() => document.querySelector(".structure-3d canvas")?.dataset.drawCalls, null, { timeout: 60000 });
  const openMs = Date.now() - started;
  const shot = async file => { await page.waitForTimeout(900); await canvas.scrollIntoViewIfNeeded(); await canvas.screenshot({ path: path.join(out, `${name}-${file}.png`) }); };
  const data = async () => page.evaluate(() => ({ ...document.querySelector(".structure-3d canvas").dataset }));
  const mode = async value => page.getByRole("group", { name: "Modo de visualização 3D" }).getByRole("button", { name: value, exact: true }).click();
  const rows = {};
  await shot("perfis-iso"); rows.profiles = await data();
  await page.getByLabel("Selecionar peça no desenho").selectOption({ index: 1 });
  await shot("perfis-selecao"); rows.selected = await data();
  await page.getByLabel("Selecionar peça no desenho").selectOption("");
  for (const tool of process.env.JPN_STUDIO_TOOLS ? JSON.parse(process.env.JPN_STUDIO_TOOLS) : []) {
    // Optional steps for builds that have the tool; older builds skip them.
    const control = page.getByRole(tool.role, { name: tool.name, exact: true });
    if (await control.count()) { await control.first().click(); await shot(tool.file); rows[tool.file] = await data(); if (tool.undo) await page.getByRole(tool.role, { name: tool.undo, exact: true }).first().click(); }
  }
  await mode("Misto"); await shot("misto"); rows.mixed = await data();
  await mode("Acabado");
  await page.waitForFunction(() => document.querySelector(".structure-3d canvas")?.dataset.contextLoaded === "true", null, { timeout: 60000 });
  await page.waitForTimeout(2500); await shot("acabado"); rows.finished = await data();
  rows.heapMb = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  rows.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  metrics[name] = { openMs, errors, ...rows };
  await context.close();
}
await browser.close();
writeFileSync(path.join(out, "metrics.json"), JSON.stringify(metrics, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { openMs: v.openMs, errors: v.errors.length, profiles: [v.profiles.drawCalls, v.profiles.triangles], finished: [v.finished.drawCalls, v.finished.triangles], heapMb: v.heapMb, overflow: v.horizontalOverflow }]))));
