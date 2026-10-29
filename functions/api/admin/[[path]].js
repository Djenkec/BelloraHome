// /api/admin/* — API za admin panel (admin.html).
// Prijava: zaglavlje "Authorization: Bearer <lozinka>", lozinka je tajna ADMIN_PASSWORD u Cloudflare postavkama.
//   GET   /api/admin/orders         → { orders: [...] }, najnovije prve
//   PATCH /api/admin/orders/:key    → { order }  (polja: status, adminNote)

const STATUSES = ["nova", "potvrdjena", "poslana", "isporucena", "otkazana"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function listOrders(kv) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "order:", cursor });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const values = await Promise.all(keys.map((k) => kv.get(k, "json")));
  return keys
    .map((key, i) => (values[i] ? { key, ...values[i] } : null))
    .filter(Boolean)
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

export async function onRequest({ request, env, params }) {
  if (!env.ORDERS || !env.ADMIN_PASSWORD) return json({ error: "Admin nije podešen na serveru." }, 503);

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !(await sameSecret(token, env.ADMIN_PASSWORD))) return json({ error: "Pogrešna lozinka." }, 401);

  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method.toUpperCase();

  if (parts[0] === "orders" && parts.length === 1 && method === "GET") {
    return json({ orders: await listOrders(env.ORDERS) });
  }

  if (parts[0] === "orders" && parts.length === 2 && method === "PATCH") {
    const key = decodeURIComponent(parts[1]);
    if (!key.startsWith("order:")) return json({ error: "Nepoznata narudžba." }, 404);
    const current = await env.ORDERS.get(key, "json");
    if (!current) return json({ error: "Narudžba nije pronađena." }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Neispravan zahtjev." }, 400); }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return json({ error: "Nepoznat status." }, 400);
      current.status = body.status;
    }
    if (body.adminNote !== undefined) current.adminNote = String(body.adminNote).slice(0, 1000);
    current.updated = new Date().toISOString();
    await env.ORDERS.put(key, JSON.stringify(current));
    return json({ order: { key, ...current } });
  }

  return json({ error: "Nepoznata akcija." }, 404);
}
