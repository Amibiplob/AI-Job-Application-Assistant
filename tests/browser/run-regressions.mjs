// Local synthetic UI regressions only. Never uses a real database or Paddle.
import { spawn } from "node:child_process";
import { mkdtemp, rm, open } from "node:fs/promises";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mode = process.env.BROWSER_TEST_SERVER_MODE ?? "start";
if (!["start", "dev"].includes(mode)) throw Error("Use start or dev server mode.");
const cases = [
  ["public-auth-navigation", "public-auth"], ["connect-onboarding", "public-auth"],
  ["resume-workspace", "resume"], ["application-tracking-workspace", "application-tracking"],
  ["job-analysis-workspace", "job-analysis"], ["job-details-workspace", "job-details"],
  ["job-search-workspace", "job-search"],
];
const requested = process.argv.slice(2);
if (requested.some(name => !cases.some(([known]) => known === name))) throw Error("Unknown regression name.");
const selected = requested.length ? cases.filter(([name]) => requested.includes(name)) : cases;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await done; clearTimeout(timer);
}
async function ready(url) {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Startup only. */ }
    await pause(200);
  }
  throw Error("Fixture startup timed out.");
}
let failed = 0;
for (const [name, fixture] of selected) {
  const directory = await mkdtemp("/tmp/browser-regression-");
  const log = await open(`${directory}/output.log`, "w");
  let server, chrome, test;
  try {
    for (const url of ["http://127.0.0.1:3100", "http://127.0.0.1:9223/json"]) {
      let occupied = false;
      try { await fetch(url, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* Unused port required. */ }
      if (occupied) throw Error("Test ports already occupied; existing servers/browsers are never controlled.");
    }
    server = spawn(process.execPath, ["--require", `./tests/browser/${fixture}-fixtures.cjs`,
      "node_modules/next/dist/bin/next", mode, ...(mode === "dev" ? ["--webpack"] : []),
      "--hostname", "127.0.0.1", "--port", "3100"], {
      env: { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://unused.invalid/fixture",
        RATE_LIMIT_SECRET: "synthetic-browser-regression-secret-only-32",
        PADDLE_SANDBOX_ENABLED: "false", PADDLE_SANDBOX_ENTITLEMENTS_ENABLED: "false",
        PADDLE_RECONCILIATION_ENABLED: "false", AUTH0_LINK_ENABLED: "false" },
      stdio: ["ignore", log.fd, log.fd],
    });
    server.on("error", () => {});
    await ready("http://127.0.0.1:3100");
    chrome = spawn(process.env.PADDLE_TEST_CHROME ?? "/opt/google/chrome/chrome", [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
      "--no-default-browser-check", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9223",
      `--user-data-dir=${directory}/profile`, "about:blank",
    ], { stdio: "ignore" });
    chrome.on("error", () => {});
    await ready("http://127.0.0.1:9223/json");
    test = spawn(process.execPath, [`tests/browser/${name}.mjs`], { stdio: ["ignore", log.fd, log.fd] });
    const timer = setTimeout(() => test.kill("SIGTERM"), 90000);
    const code = await new Promise(resolve => { test.once("exit", resolve); test.once("error", () => resolve(-1)); });
    clearTimeout(timer);
    if (code !== 0) { failed++; console.log(`FAIL ${name}: ${directory}/output.log`); }
    else console.log(`PASS ${name}`);
  } catch (error) {
    failed++; console.log(`BLOCKED ${name}: ${error.message} Log: ${directory}/output.log`);
  } finally {
    await stop(test); await stop(chrome); await stop(server); await log.close();
    await rm(`${directory}/profile`, { recursive: true, force: true });
  }
}
process.exitCode = failed ? 1 : 0;
