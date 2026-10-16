import "server-only";

export type PaddleSandboxConfig = {
  apiKey: string; webhookSecret: string; clientToken: string;
  priceId: string; appOrigin: string; checkoutUrl: string;
};

export function getPaddleSandboxConfig(env: NodeJS.ProcessEnv = process.env): PaddleSandboxConfig | null {
  if (env.PADDLE_SANDBOX_ENABLED !== "true" || env.BILLING_DEPLOYMENT_ENV !== "sandbox" ||
      env.VERCEL_ENV === "production" || env.DEPLOYMENT_ENV === "production") return null;
  const { PADDLE_SANDBOX_API_KEY: apiKey, PADDLE_SANDBOX_WEBHOOK_SECRET: webhookSecret,
    PADDLE_SANDBOX_CLIENT_TOKEN: clientToken, PADDLE_SANDBOX_PRICE_ID: priceId } = env;
  if (!apiKey || !/^pdl_sdbx_apikey_[A-Za-z0-9_-]{20,256}$/.test(apiKey) ||
      !webhookSecret || !/^[\x21-\x7e]{32,256}$/.test(webhookSecret) ||
      !clientToken || !/^test_[A-Za-z0-9_-]{20,256}$/.test(clientToken) ||
      !priceId || !/^pri_[a-z0-9]{26}$/.test(priceId)) return null;
  try {
    const url = new URL(env.APP_BASE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { apiKey, webhookSecret, clientToken, priceId, appOrigin: url.origin, checkoutUrl: `${url.origin}/billing/checkout` };
  } catch { return null; }
}

// Independent kill switch: both reads and writes require a valid sandbox runtime.
export function sandboxEntitlementsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PADDLE_SANDBOX_ENTITLEMENTS_ENABLED === "true" && getPaddleSandboxConfig(env) !== null;
}
