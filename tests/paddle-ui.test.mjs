import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
const require = createRequire(import.meta.url); require("tsx/cjs");
const Module = require("node:module"), original = Module._load;
let enabled, signedIn, available, checkoutId, fixtureStatus;
const config = { clientToken: "test_public-client-token", apiKey: "private-api-key-never-render", webhookSecret: "private-webhook-secret-never-render" };
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "@/lib/auth") return { getCurrentUser: async () => signedIn ? { id: "website-owner" } : null };
  if (id === "@/lib/db/pool") return { pool: {} };
  if (id === "@/lib/monetization/current-user") return { getCurrentUserMonthlyUsage: async () => ({ plan: "free", remaining: 3, limit: 3 }) };
  if (id === "@/lib/billing/paddle/config") return { getPaddleSandboxConfig: () => enabled ? config : null };
  if (id === "@/lib/billing/paddle/client") return { createPaddleSandboxClient: () => ({}) };
  if (id === "@/lib/billing/paddle/store") return { createPaddleSandboxStore: () => ({
    status: async userId => { assert.equal(userId, "website-owner"); if (!available) throw Error("DB unavailable"); return fixtureStatus; },
    acceptsCheckout: async (userId, id) => userId === "website-owner" && id === checkoutId,
  }) };
  return original.call(this, id, ...args);
};
let Pricing, Billing, Checkout;
try {
  Pricing = require("../app/pricing/page.tsx").default;
  Billing = require("../app/dashboard/billing/page.tsx").default;
  Checkout = require("../app/billing/checkout/page.tsx").default;
} finally { Module._load = original; }
const { renderToStaticMarkup } = require("react-dom/server");
beforeEach(() => { enabled = false; signedIn = true; available = true; fixtureStatus = null; checkoutId = "txn_" + "a".repeat(26); });
test("pricing describes existing limits and unavailable paid access without rendering private credentials", () => {
  const html = renderToStaticMarkup(Pricing());
  assert.match(html, /3 successful website matches/); assert.match(html, /100 successful website matches/);
  assert.match(html, /Draft price: \$10 USD\/month/); assert.match(html, /Paid access is not available/);
  assert.doesNotMatch(html, /private-api-key|private-webhook-secret/);
  assert.match(html, /Pro — coming soon/);
  assert.doesNotMatch(html, /<form|href="\/(?:billing\/checkout|dashboard\/billing)"|paddle\.com/);
});
test("billing requires website login and disabled/missing database cannot display checkout", async () => {
  signedIn = false; await assert.rejects(Billing(), /NEXT_REDIRECT/); signedIn = true;
  const html = renderToStaticMarkup(await Billing()); assert.match(html, /Sandbox checkout is disabled/); assert.doesNotMatch(html, /<form/);
  enabled = true; available = false;
  assert.doesNotMatch(renderToStaticMarkup(await Billing()), /<form/);
});
test("checkout page only loads Paddle for the authenticated owner's exact transaction", async () => {
  enabled = true;
  for (const value of [undefined, "txn_victim", [checkoutId, checkoutId]]) {
    const html = renderToStaticMarkup(await Checkout({ searchParams: Promise.resolve({ _ptxn: value }) }));
    assert.match(html, /disabled, expired, or unavailable/);
  }
  signedIn = false; await assert.rejects(Checkout({ searchParams: Promise.resolve({ _ptxn: checkoutId }) }), /NEXT_REDIRECT/);
  signedIn = true;
  const html = renderToStaticMarkup(await Checkout({ searchParams: Promise.resolve({ _ptxn: checkoutId }) }));
  assert.match(html, /Test payments only/); assert.doesNotMatch(html, /private-api-key|private-webhook-secret/);
});

test("refund preview is distinct from actual website entitlement and never renders private identifiers", async () => {
  enabled = true;
  fixtureStatus = { checkoutState: "linked", subscriptionStatus: "active", paymentRevoked: true, sandboxAccessPreview: "free",
    paidThrough: "2026-12-01T00:00:00Z", reconciledAt: "2026-10-15T00:00:00Z", subscriptionId: "private-subscription-id" };
  const html = renderToStaticMarkup(await Billing());
  assert.match(html, /Website plan: Free/);
  assert.match(html, /Sandbox access preview: Free/);
  assert.match(html, /refunded or disputed/);
  assert.doesNotMatch(html, /private-subscription-id|private-api-key|Open sandbox checkout/);
});
