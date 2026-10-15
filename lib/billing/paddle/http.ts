import "server-only";
export function billingResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export function billingRedirect(location: string | URL): Response {
  return new Response(null, { status: 303, headers: { Location: String(location), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export function sameOriginBillingPost(request: Request, origin: string) {
  const site = request.headers.get("sec-fetch-site");
  return request.headers.get("origin") === origin && (!site || site === "same-origin");
}
