"use client";
import Script from "next/script";
import { useState } from "react";

type PaddleBrowser = {
  Environment: { set(value: "sandbox"): void };
  Initialize(options: { token: string }): void;
  Checkout: { open(options: { transactionId: string; settings: { allowLogout: boolean; showAddDiscounts: boolean } }): void };
};
let initializedToken: string | null = null;

export function SandboxCheckout({ clientToken, transactionId }: { clientToken: string; transactionId: string }) {
  const [failed, setFailed] = useState(false);
  function open() {
    const paddle = (window as unknown as { Paddle?: PaddleBrowser }).Paddle;
    if (!paddle) { setFailed(true); return; }
    try {
      // _ptxn auto-launches on Initialize. Remove it so only the transaction
      // explicitly authorized by the server is opened once below.
      const url = new URL(window.location.href); url.searchParams.delete("_ptxn");
      window.history.replaceState(window.history.state, "", url);
      if (initializedToken !== clientToken) {
        if (initializedToken !== null) throw new Error("Sandbox configuration changed.");
        paddle.Environment.set("sandbox");
        paddle.Initialize({ token: clientToken });
        initializedToken = clientToken;
      }
      paddle.Checkout.open({ transactionId, settings: { allowLogout: false, showAddDiscounts: false } });
    } catch { setFailed(true); }
  }
  return <>
    <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onReady={open} onError={() => setFailed(true)} />
    <p role="status">{failed ? "Sandbox checkout could not load. Return to billing status to retry." : "Opening test checkout. Use sandbox payment details only."}</p>
  </>;
}
