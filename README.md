# add.konohaserver.id — pengalih langsung ke aplikasi Minecraft (v5)

Tanpa halaman web. Pemain klik link, dua skema `minecraft://` ditembakkan
berurutan: server tersimpan di daftar, lalu pemain langsung masuk dunia.

## Rute

| Rute | Perilaku |
|---|---|
| `/` | **Simpan lalu masuk.** Satu respons HTML identik untuk semua perangkat. Bedrock: dua navigasi tingkat atas berurutan (jeda 150 ms). Java: browser mengalihkan ke `/servers.dat`. |
| `/r` | Urutan dibalik: masuk dulu, simpan sesudahnya. |
| `/save` | Hanya simpan (302). Terbukti bekerja. |
| `/join` | Hanya masuk (302). Terbukti bekerja. |
| `/both` | Dua argumen dalam satu URI (302). Terbukti gagal, disimpan untuk rujukan. |
| `/servers.dat` | File daftar server untuk Java. |
| `/java` | Paksa jalur Java. |

Jalur tak dikenal dialihkan ke `/`. Jeda antar-skema dapat disetel:
`?jeda=300` (default 150 ms, maksimum 5000).

## Data server (diverifikasi live)

| Item | Nilai |
|---|---|
| Host | `play.konohaserver.id` → `139.162.24.73` |
| Java | TCP `25565` |
| Bedrock | UDP `19132` |

## Riwayat hasil uji perangkat nyata (dasar desain v5)

| Percobaan | Hasil |
|---|---|
| `addExternalServer` lewat navigasi (302) | server TERSIMPAN |
| `connect?serverUrl&serverPort` lewat navigasi (302) | MASUK DUNIA |
| `connect?...&addExternalServer=...` satu URI | GAGAL — argumen pertama saja |
| skema kustom di `<iframe>` | GAGAL — diblokir senyap |
| dua navigasi berjarak 900 ms | langkah 1 jalan, langkah 2 GAGAL — Minecraft sudah mengambil layar, Chrome kebelakang, Android larang startActivity dari background |
| dua navigasi berjarak 150 ms (v5) | sedang diuji |

## Cara `/` bekerja (v5)

```
klik https://add.konohaserver.id
  ↓ HTTP 200 — HTML minimal, tanpa tampilan
skrip langsung jalan:
  1. location.href = minecraft://?addExternalServer=KONOHA%20Network|play.konohaserver.id:19132
  2. setTimeout 150 ms → location.href = minecraft://connect?serverUrl=play.konohaserver.id&serverPort=19132
  ↓
server tersimpan + pemain masuk dunia
```

Kunci desain: langkah kedua ditembakkan **selagi browser masih di depan** —
sebelum aktivitas Minecraft sempat tampil. Setelah Minecraft mengambil layar,
Chrome dianggap latar belakang dan Android menolak `startActivity` darinya.

Jaring pengaman: event `visibilitychange` menembakkan langkah kedua lagi saat
pemain kembali ke browser. Penjaga `sudah` mencegah dobel.

## Mengapa percabangan Bedrock/Java di browser, bukan server

Versi awal memilih respons di server berdasarkan header `User-Agent`. Gagal di
produksi: CDN (Vercel Edge) menyimpan satu varian per URL dan menyajikannya ke
semua perangkat — pemain Android menerima unduhan `servers.dat`.

Sekarang rute `/` selalu mengembalikan satu HTML identik (diverifikasi md5 sama
di banyak User-Agent). Keputusan platform dibuat browser lewat
`navigator.userAgent`. Semua respons memakai
`Cache-Control: no-store, no-cache, must-revalidate` + `Vary: User-Agent`.

## Deploy ke Vercel

```
cd konoha-link
vercel --prod
```

Lalu Settings → Domains → `add.konohaserver.id`, DNS:
`CNAME add cname.vercel-dns.com`

## Deploy ke Cloudflare Workers

```
cd konoha-link
npx wrangler deploy
```

Lalu Workers & Pages → konoha-add → Settings → Domains & Routes → Add Custom
Domain → `add.konohaserver.id`.

## Uji lokal

```
node tools/test_redirect.js   # logika Worker
node tools/test_vercel.js     # handler Vercel
npx wrangler dev --local      # runtime Cloudflare asli di :8787
```

## Batasan yang jujur

- **Java tidak punya skema URI.** Pemain Java menerima `servers.dat` (88 byte)
  untuk ditaruh di folder `.minecraft`.
- **iOS** memblokir skema non-http di browser dalam aplikasi (Instagram,
  TikTok). Link harus dibuka di Safari.
- **Konsol** (Xbox, PlayStation, Switch) tidak mendukung deep link maupun
  server pihak ketiga.
- **Satu klik = dua intent.** Selalu ada kemungkinan kecil OS/browser
  menolak intent kedua. Jaring pengaman `visibilitychange` menembakkan ulang
  saat pemain kembali ke browser.

## Mengubah host atau nama server

Ubah `CFG` di `worker/lib.js` dan `api/index.js`, lalu buat ulang base64
`servers.dat`:

```
python3 tools/make_servers_dat.py
```
