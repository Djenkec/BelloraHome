// POST /api/order — prima narudžbu iz korpe i sprema je u KV (binding ORDERS).
// Cijene se uvijek računaju ovdje, iz serverskog kataloga, nikad iz onoga što pošalje preglednik.
import { PRODUCTS } from "../_lib/products.js";

const FREE_SHIP = 100;
const SHIP_COST = 8;
const PROMOS = { BELLORA10: 0.1 };
// Obavijesti idu preko Web3Forms na bellora.home1@gmail.com (javni ključ, nije tajna).
const WEB3FORMS_KEY = "c00081f8-2e26-4152-963f-f15308caa13a";
const MAX_ORDERS_PER_IP_PER_10_MIN = 8;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const round2 = (n) => Math.round(n * 100) / 100;
const km = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " KM";

export async function onRequestPost({ request, env }) {
  if (!env.ORDERS) return json({ ok: false, error: "Narudžbe trenutno nisu dostupne. Pokušaj ponovo kasnije." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtjev." }, 400); }

  // Zamka za botove: skriveno polje mora ostati prazno.
  if (body && body.website) return json({ ok: true, nr: "BH-0", total: 0 });

  const c = body?.customer || {};
  const customer = {
    name: clean(c.name, 80), phone: clean(c.phone, 30), email: clean(c.email, 120),
    address: clean(c.address, 150), city: clean(c.city, 60), zip: clean(c.zip, 10), note: clean(c.note, 500),
  };
  for (const f of ["name", "phone", "address", "city", "zip"]) {
    if (!customer[f]) return json({ ok: false, error: "Popuni sva obavezna polja." }, 400);
  }
  if (customer.phone.replace(/\D/g, "").length < 6) return json({ ok: false, error: "Upiši ispravan broj telefona." }, 400);
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) return json({ ok: false, error: "Email adresa nije ispravna." }, 400);

  const raw = Array.isArray(body?.items) ? body.items.slice(0, 60) : [];
  const merged = new Map();
  for (const it of raw) {
    const id = Number(it?.id), v = Number(it?.v ?? 0), qty = Math.floor(Number(it?.qty));
    const p = PRODUCTS[id];
    if (!p || !p.v[v] || !(qty >= 1 && qty <= 99)) continue;
    const k = id + ":" + v;
    merged.set(k, Math.min(99, (merged.get(k) || 0) + qty));
  }
  if (!merged.size) return json({ ok: false, error: "Korpa je prazna ili proizvodi više nisu dostupni." }, 400);

  const items = [...merged].map(([k, qty]) => {
    const [id, v] = k.split(":").map(Number);
    const p = PRODUCTS[id], vr = p.v[v];
    return { id, name: p.n, variant: vr.l || "", code: vr.c || "", price: vr.p, qty, sum: round2(vr.p * qty) };
  });

  const sub = round2(items.reduce((s, i) => s + i.sum, 0));
  const promo = typeof body.promo === "string" && PROMOS[body.promo.toUpperCase()] ? body.promo.toUpperCase() : null;
  const disc = promo ? round2(sub * PROMOS[promo]) : 0;
  const ship = sub - disc >= FREE_SHIP ? 0 : SHIP_COST;
  const total = round2(sub - disc + ship);

  // Jednostavna zaštita od zloupotrebe po IP adresi.
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip) {
    const rlKey = "rl:" + ip;
    const n = Number((await env.ORDERS.get(rlKey)) || 0);
    if (n >= MAX_ORDERS_PER_IP_PER_10_MIN) return json({ ok: false, error: "Previše narudžbi u kratkom roku. Pokušaj ponovo za nekoliko minuta." }, 429);
    await env.ORDERS.put(rlKey, String(n + 1), { expirationTtl: 600 });
  }

  const now = new Date();
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const nr = "BH-" + ymd + "-" + String(Math.floor(1000 + Math.random() * 9000));
  const key = "order:" + now.getTime() + ":" + nr;
  const order = {
    nr, created: now.toISOString(), status: "nova", customer, pay: "cod",
    items, sub, promo, disc, ship, total, adminNote: "", ip, updated: now.toISOString(),
  };
  await env.ORDERS.put(key, JSON.stringify(order));

  // Obavijest na mail šalje preglednik kupca (Web3Forms), da narudžba nikad ne čeka na mail servis.
  const lines = items.map((i) => `${i.qty} × ${i.name}${i.variant ? " (" + i.variant + ")" : ""}${i.code ? " [" + i.code + "]" : ""} — ${km(i.sum)}`).join("\n");
  const notify = {
    url: "https://api.web3forms.com/submit",
    body: {
      access_key: env.WEB3FORMS_KEY || WEB3FORMS_KEY,
      subject: `Nova narudžba ${nr} — ${km(total)}`,
      from_name: "BelloraHome narudžbe",
      Narudzba: nr,
      Kupac: customer.name,
      Telefon: customer.phone,
      Email: customer.email || "—",
      Adresa: `${customer.address}, ${customer.zip} ${customer.city}`,
      Napomena: customer.note || "—",
      Proizvodi: lines,
      Medjuzbir: km(sub),
      Popust: disc ? `${km(disc)} (${promo})` : "—",
      Dostava: ship ? km(ship) : "Besplatno",
      Ukupno: km(total),
      Admin: "https://bellorahome.com/admin",
    },
  };

  return json({ ok: true, nr, total, notify });
}

export async function onRequest() {
  return json({ ok: false, error: "Metoda nije dozvoljena." }, 405);
}
