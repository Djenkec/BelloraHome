// POST /api/club — učlanjenje u BelloraHome Klub.
// GET  /api/club?q=<broj kartice ili telefon> — provjera članstva za popust u korpi.
import { joinClub, findMember, publicMember } from "../_lib/club.js";

const NOTIFY_KEY = "c00081f8-2e26-4152-963f-f15308caa13a";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function limited(kv, key, max) {
  const n = Number((await kv.get(key)) || 0);
  if (n >= max) return true;
  await kv.put(key, String(n + 1), { expirationTtl: 600 });
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!env.ORDERS) return json({ ok: false, error: "Klub trenutno nije dostupan." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtjev." }, 400); }
  if (body && body.website) return json({ ok: true, nr: "BH-0000", first: "" });
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip && (await limited(env.ORDERS, "rlc:" + ip, 10))) return json({ ok: false, error: "Previše pokušaja. Pokušaj ponovo za nekoliko minuta." }, 429);

  const res = await joinClub(env.ORDERS, body || {}, ip, "sajt");
  if (res.error) return json({ ok: false, error: res.error }, 400);
  const m = res.member;
  const notify = res.existing ? null : {
    url: "https://api.web3forms.com/submit",
    body: {
      access_key: env.WEB3FORMS_KEY || NOTIFY_KEY,
      subject: `Novi član kluba ${m.nr} — ${m.name}`,
      from_name: "BelloraHome Klub",
      Kartica: m.nr, Ime: m.name, Telefon: m.phone, Grad: m.city || "—", Email: m.email || "—",
      Admin: "https://bellorahome.com/admin#klub",
    },
  };
  return json({ ok: true, ...publicMember(m), name: m.name, existing: res.existing, notify });
}

export async function onRequestGet({ request, env }) {
  if (!env.ORDERS) return json({ ok: false }, 503);
  const q = new URL(request.url).searchParams.get("q") || "";
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip && (await limited(env.ORDERS, "rlq:" + ip, 30))) return json({ ok: false, error: "Previše pokušaja." }, 429);
  const m = await findMember(env.ORDERS, q);
  if (!m) return json({ ok: false, error: "Nismo našli člana s tim brojem kartice ili telefonom." }, 404);
  return json({ ok: true, ...publicMember(m) });
}

export async function onRequest() {
  return json({ ok: false, error: "Metoda nije dozvoljena." }, 405);
}
