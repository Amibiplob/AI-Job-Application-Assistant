// Self-contained disabled-billing browser smoke. Synthetic pg fixtures only;
// never opens Paddle, submits a payment, or attaches to an existing browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = "http://127.0.0.1:3147";
const debugging = "http://127.0.0.1:9337";
const profile = await mkdtemp(path.join(tmpdir(), "paddle-browser-"));
const processes = [];
let ws;
async function poll(operation) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const value = await operation(); if (value) return value; } catch { /* Startup only. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Fixture/browser startup timed out.");
}
async function stop(process) {
  if (!process.pid || process.exitCode !== null || process.signalCode !== null) return;
  const exited = new Promise(resolve => process.once("exit", resolve));
  process.kill("SIGTERM");
  const timeout = setTimeout(() => process.kill("SIGKILL"), 3000);
  await exited; clearTimeout(timeout);
}
try {
  // Refuse occupied ports before starting anything; never control an existing tab.
  for (const address of [origin, debugging + "/json/version"])
    await assert.rejects(fetch(address), "Test ports must be unused.");
  const server = spawn(process.execPath, ["--require", "./tests/browser/public-auth-fixtures.cjs", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3147"], {
    env: { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://unused.invalid/fixture",
      PADDLE_SANDBOX_ENABLED: "false", PADDLE_RECONCILIATION_ENABLED: "false", AUTH0_LINK_ENABLED: "false" }, stdio: "ignore",
  });
  processes.push(server);
  await poll(async () => (await fetch(origin + "/pricing")).ok);
  const browser = spawn(process.env.PADDLE_TEST_CHROME ?? "/opt/google/chrome/chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9337", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  processes.push(browser);
  browser.on("error", () => {});
  const targets = await poll(async () => { const values = await (await fetch(debugging + "/json")).json(); return values.some(value => value.type === "page") ? values : null; });
  ws = new WebSocket(targets.find(value => value.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  ws.addEventListener("message", event => {
    const data = JSON.parse(event.data); const promise = pending.get(data.id);
    if (promise) { pending.delete(data.id); if (data.error) promise.reject(Error("Browser command failed.")); else promise.resolve(data.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw Error("Browser evaluation failed.");
    return result.result.value;
  };
  const navigate = async (route, text) => {
    await send("Page.navigate", { url: origin + route });
    await poll(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`));
  };
  await navigate("/pricing", "Website plans");
  assert.match(await evaluate("document.body.innerText"), /3 successful website matches[\s\S]*100 successful website matches/);
  assert.equal(await evaluate("!!document.querySelector('script[src*=\"paddle.com\"]')"), false);
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  }
  await navigate("/dashboard/billing", "Sign in");
  assert.equal(await evaluate("location.pathname"), "/login");
  await send("Network.setCookie", { name: "session", value: "11111111-1111-4111-8111-111111111111", url: origin, httpOnly: true });
  await navigate("/dashboard/billing", "Sandbox checkout is disabled");
  assert.equal(await evaluate("!!document.querySelector('form[action*=\"/api/billing/\"]')"), false);
  await navigate("/billing/checkout?_ptxn=txn_aaaaaaaaaaaaaaaaaaaaaaaaaa", "Checkout is disabled, expired, or unavailable");
  assert.equal(await evaluate("!!document.querySelector('script[src*=\"paddle.com\"]')"), false);
  console.log("PASS: pricing, responsive widths, login guard, disabled billing and rejected checkout in isolated Chrome.");
} finally {
  ws?.close();
  for (const process of processes.reverse()) await stop(process);
  await rm(profile, { recursive: true, force: true });
}
