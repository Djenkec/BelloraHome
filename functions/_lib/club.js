// Bellora Club: članovi se čuvaju u KV (binding ORDERS).
//   member:<BH-1001>   → podaci člana
//   mphone:<061...>    → broj kartice (za provjeru po telefonu)
//   club:seq           → posljednji dodijeljeni broj
export const CLUB_DISCOUNT = 0.1;
export const MEMBER_STATUSES = ["novi", "pozvan", "ne_javlja", "zainteresovan", "kupio", "ne_zeli"];
export const CONSENT_TEXT =
  "Slažem se da me BelloraHome kontaktira telefonom, Viberom ili mailom u vezi s ponudama i pogodnostima Bellora Cluba. Mogu se odjaviti u svakom trenutku.";

export const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// Telefon u jedan oblik: samo cifre, +387 / 00387 → 0.
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("00387")) d = "0" + d.slice(5);
  else if (d.startsWith("387")) d = "0" + d.slice(3);
  return d;
}

export function normNr(q) {
  const m = String(q || "").toUpperCase().replace(/\s/g, "").match(/^(?:BH-?)?(\d{4,6})$/);
  return m ? "BH-" + m[1] : null;
}

// Nađi člana po broju kartice ili telefonu.
export async function findMember(kv, q) {
  const nr = normNr(q);
  if (nr) {
    const m = await kv.get("member:" + nr, "json");
    if (m) return m;
  }
  const ph = normPhone(q);
  if (ph.length >= 6) {
    const n = await kv.get("mphone:" + ph);
    if (n) return await kv.get("member:" + n, "json");
  }
  return null;
}

// Napravi novog člana ili vrati postojećeg (isti telefon = ista kartica).
export async function joinClub(kv, data, ip, source) {
  const name = clean(data.name, 80), phone = clean(data.phone, 30), email = clean(data.email, 120), city = clean(data.city, 60);
  if (name.length < 2) return { error: "Upiši ime i prezime." };
  const ph = normPhone(phone);
  if (ph.length < 6) return { error: "Upiši ispravan broj telefona." };
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Email adresa nije ispravna." };
  if (!data.consent) return { error: "Za učlanjenje je potrebna saglasnost." };

  const existingNr = await kv.get("mphone:" + ph);
  if (existingNr) {
    const m = await kv.get("member:" + existingNr, "json");
    if (m) {
      let changed = false;
      if (email && !m.email) { m.email = email; changed = true; }
      if (city && !m.city) { m.city = city; changed = true; }
      if (changed) { m.updated = new Date().toISOString(); await kv.put("member:" + m.nr, JSON.stringify(m)); }
      return { member: m, existing: true };
    }
  }

  let seq = Number((await kv.get("club:seq")) || 1000) + 1;
  let nr = "BH-" + seq;
  for (let i = 0; i < 5 && (await kv.get("member:" + nr)); i++) { seq += 1 + Math.floor(Math.random() * 7); nr = "BH-" + seq; }
  await kv.put("club:seq", String(seq));

  const now = new Date().toISOString();
  const member = {
    nr, name, phone, phoneN: ph, email, city,
    consent: true, consentText: CONSENT_TEXT, consentAt: now,
    created: now, updated: now, source: source || "sajt", ip: ip || "",
    status: "novi", agent: "", note: "", orders: [], spent: 0,
  };
  await kv.put("member:" + nr, JSON.stringify(member));
  await kv.put("mphone:" + ph, nr);
  return { member, existing: false };
}

export const publicMember = (m) => ({ nr: m.nr, first: String(m.name || "").split(" ")[0] });
