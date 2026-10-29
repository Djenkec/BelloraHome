// Sigurnosna zaglavlja za sve odgovore; admin i API se ne indeksiraju na Googlu.
export async function onRequest({ request, next }) {
  const res = await next();
  const out = new Response(res.body, res);
  const path = new URL(request.url).pathname;
  out.headers.set("x-content-type-options", "nosniff");
  out.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  out.headers.set("x-frame-options", "SAMEORIGIN");
  if (path.startsWith("/admin") || path.startsWith("/api/")) {
    out.headers.set("x-robots-tag", "noindex, nofollow");
    out.headers.set("cache-control", "no-store");
  }
  return out;
}
