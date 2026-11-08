# BelloraHome

Web shop za bellorahome.com (Cloudflare Pages).

- `public/` — sve što vide kupci: `index.html` (naslovna, kategorije, lista proizvoda, korpa i naplata), `admin.html` (pregled narudžbi), `katalog.json` (218 proizvoda), slike u `img/` i `p/`.
- `functions/` — serverski dio:
  - `api/order.js` prima narudžbu, računa cijene iz `_lib/products.js` i sprema je u KV bazu `ORDERS`.
  - `api/admin/[[path]].js` daje narudžbe admin panelu i mijenja status/bilješku.
  - `_middleware.js` sigurnosna zaglavlja.

## Postavke u Cloudflareu (Pages projekat `bellorahome`)

- Build command: prazno · Build output directory: `public`
- KV binding: `ORDERS` → `bellorahome-orders`
- Tajna: `ADMIN_PASSWORD` (lozinka za /admin)

Dostava 8 KM, besplatna od 100 KM. Popust −10% imaju samo članovi BelloraHome Kluba (`api/club.js`, `_lib/club.js`): učlanjenje na sajtu ili uz narudžbu, kartica BH-xxxx, popust se provjerava na serveru. Članovi se vode u adminu na kartici Klub (status poziva, agent, bilješka, izvoz CSV). Obavijesti o narudžbama idu na bellora.home1@gmail.com preko Web3Forms (ključ u `functions/api/order.js`).

Kad se mijenjaju cijene ili proizvodi, ažuriraj i `public/katalog.json` i `functions/_lib/products.js`.
