// Optional local visual/interaction verification. Playwright stays outside repository dependencies.
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(
  process.env.CANLEARN_SMOKE_PLAYWRIGHT_PATH ??
    "/tmp/canlearn-cl013-browser/node_modules/playwright",
);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const evidence = path.join(__dirname, "../docs/integration/CL-013a/screenshots");
  mkdirSync(evidence, { recursive: true });
  const checks = [];
  await page.goto("http://127.0.0.1:3310/smoke");
  await page.getByLabel("模拟处理时间（毫秒，0–15000）").fill("500");
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.locator(".smoke-status").filter({ hasText: "SUCCEEDED" }).waitFor();
  const id = await page.getByLabel("Job ID", { exact: true }).inputValue();
  checks.push("browser creates and polls a successful real Job");
  await page.getByRole("button", { name: "同键重发" }).click();
  await page.waitForFunction(() => !document.querySelector("button")?.disabled);
  if ((await page.getByLabel("Job ID", { exact: true }).inputValue()) !== id)
    throw new Error("Browser replay changed Job ID");
  checks.push("same-key button preserves Job ID");
  await page.screenshot({ path: path.join(evidence, "success-desktop.png"), fullPage: true });
  await page.getByLabel("预期结果").selectOption("partial");
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.locator(".smoke-status").filter({ hasText: "PARTIAL_READY" }).waitFor();
  checks.push("partial result and page statuses render");
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)))
    throw new Error("Mobile horizontal overflow");
  await page.screenshot({ path: path.join(evidence, "partial-mobile.png"), fullPage: true });
  checks.push("390px mobile layout has no horizontal overflow");
  await page.getByLabel("预期结果").selectOption("success");
  await page.getByLabel("模拟处理时间（毫秒，0–15000）").fill("10000");
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.locator(".smoke-status").filter({ hasText: "RUNNING" }).waitFor();
  await page.getByRole("button", { name: "取消任务" }).click();
  await page.locator(".smoke-status").filter({ hasText: "CANCELLED" }).waitFor();
  await page
    .locator("dd")
    .filter({ hasText: /^confirmed$/ })
    .waitFor();
  checks.push("browser cancellation reaches confirmed synthetic stop");
  await page.getByRole("button", { name: "查询 / 刷新" }).click();
  await page.locator(".smoke-status").filter({ hasText: "CANCELLED" }).waitFor();
  checks.push("manual refresh preserves cancellation");
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(",")}`);
  checks.push("no browser page errors");
  const record = {
    recorded_at: new Date().toISOString(),
    playwright: "1.56.1",
    chromium: browser.version(),
    passed: checks.length,
    checks,
  };
  writeFileSync(
    path.join(evidence, "browser-results.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  console.log(`${checks.length} browser checks passed`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
