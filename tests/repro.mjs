import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 7302;
const ORIGIN = `http://localhost:${PORT}`;
const RUNS = Number(process.env.RUNS ?? 3);

const server = spawn("pnpm", ["preview", "--port", String(PORT)], {
  stdio: ["ignore", "pipe", "inherit"],
  detached: true,
});
await new Promise((resolve, reject) => {
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes(String(PORT))) resolve();
  });
  server.on("exit", (code) => reject(new Error(`preview exited with ${code}`)));
});

const observe = () => {
  const seen = new WeakSet();
  window.skeletonSeen = { distinct: 0, maxAtOnce: 0, maxVisibleAtOnce: 0, contentAt: null };
  const scan = () => {
    const skeletons = document.querySelectorAll("[data-skeleton]");
    for (const element of skeletons) {
      if (!seen.has(element)) {
        seen.add(element);
        window.skeletonSeen.distinct++;
      }
    }
    const visible = [...skeletons].filter((element) => element.checkVisibility()).length;
    window.skeletonSeen.maxAtOnce = Math.max(window.skeletonSeen.maxAtOnce, skeletons.length);
    window.skeletonSeen.maxVisibleAtOnce = Math.max(window.skeletonSeen.maxVisibleAtOnce, visible);
    if (window.skeletonSeen.contentAt === null && document.querySelector("[data-content]")) {
      window.skeletonSeen.contentAt = performance.now();
    }
  };
  new MutationObserver(scan).observe(document, { childList: true, subtree: true, attributes: true });
};

const SCENARIOS = [
  { min: "400", chunkDelay: 0 },
  { min: "0", chunkDelay: 0 },
  { min: "0", chunkDelay: 300 },
];

const browser = await chromium.launch();
let failures = 0;
try {
  for (const { min, chunkDelay } of SCENARIOS) for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext();
    await context.addInitScript(observe);
    if (chunkDelay > 0) {
      await context.route(/\/assets\/dashboard-[^/]+\.js$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, chunkDelay));
        await route.continue();
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));

    const response = await page.goto(`${ORIGIN}/dashboard?min=${min}`, { waitUntil: "commit" });
    const html = await response.text();
    const serverSkeleton = html.includes("data-skeleton");
    await page.locator("[data-content]").waitFor();
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => ({
      attaches: window.skeletonAttaches ?? 0,
      distinct: window.skeletonSeen.distinct,
      maxAtOnce: window.skeletonSeen.maxAtOnce,
      maxVisibleAtOnce: window.skeletonSeen.maxVisibleAtOnce,
      contentAt: Math.round(window.skeletonSeen.contentAt ?? -1),
      domContentLoaded: Math.round(performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd),
    }));
    const bad = result.distinct > 1 || result.attaches > 1 || errors.length > 0;
    if (bad) failures++;
    console.log(
      `${bad ? "FAIL" : "ok  "} pendingMinMs=${min}, route chunk delay ${chunkDelay} ms, run ${run}: server skeleton ${serverSkeleton}, ` +
        `skeleton elements ${result.distinct}, ref attaches ${result.attaches}, ` +
        `most in the DOM at once ${result.maxAtOnce} (${result.maxVisibleAtOnce} visible), content at ${result.contentAt} ms ` +
        `(DOMContentLoaded ${result.domContentLoaded} ms)` +
        (errors.length ? `\n  ${errors.join("\n  ")}` : ""),
    );
    await context.close();
  }
} finally {
  await browser.close();
  process.kill(-server.pid);
}

console.log(`\n${failures}/${RUNS * SCENARIOS.length} loads mounted a second skeleton`);
process.exit(failures > 0 ? 1 : 0);
