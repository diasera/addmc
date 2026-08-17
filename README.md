# add.konohaserver.id — pengalih langsung ke aplikasi Minecraft

Tanpa halaman web. Pemain klik link, browser mengembalikan **HTTP 302** ke skema
`minecraft://`, dan aplikasi Minecraft langsung terbuka. Tidak ada tombol, tidak
ada tampilan, tidak ada yang perlu dibaca pemain.

```
https://add.konohaserver.id
        ↓ HTTP 302
minecraft://?addExternalServer=KONOHA%20Network|play.konohaserver.id:19132
        ↓
Minecraft terbuka, server tersimpan permanen di tab Servers
```

## Rute

| Rute | Perilaku |
|---|---|
| `/` | **Satu respons untuk semua perangkat.** Bedrock: simpan server + langsung masuk dunia. Java: browser mengalihkan ke `/servers.dat`. |
| `/t1` | Uji: langkah simpan lewat iframe — **terbukti gagal menyimpan**. |
| `/t2` | Uji: simpan lalu masuk, keduanya navigasi tingkat atas (sama dengan `/`). |
| `/t3` | Uji: urutan dibalik — masuk dulu, simpan sesudahnya. |
| `/join` | Hanya sambung langsung — terbukti bekerja di perangkat nyata. |
| `/save` | Hanya simpan ke daftar server — terbukti bekerja. |
| `/both` | Dua argumen dalam satu URI — **terbukti gagal**, disimpan untuk rujukan. |
| `/servers.dat` | File daftar server untuk Java. |
| `/java` | Paksa jalur Java dari perangkat apa pun. |

Jalur tak dikenal dialihkan ke `/`.

Jeda antar-skema dapat disetel: `?jeda=1500` (default 900 ms, maksimum 5000).
Naikkan bila perangkat lambat dan langkah kedua terpotong.

## Cara `/` bekerja

Satu respons HTTP hanya bisa memuat satu header `Location`, jadi satu redirect
tidak mungkin menembakkan dua skema. Menggabungkan `addExternalServer` dan
`connect` dalam satu URI juga terbukti gagal — Minecraft memproses argumen
pertama saja.

Solusinya halaman perantara tanpa tampilan (latar gelap, tanpa teks, tanpa
tombol) yang melakukan **dua navigasi tingkat atas** berurutan:

1. `location.href = minecraft://?addExternalServer=...` → server tersimpan.
2. Setelah 900 ms, `location.href = minecraft://connect?...` → pemain masuk dunia.

Navigasi ke skema kustom tidak membongkar halaman: aplikasi terbuka di depan,
halaman tetap hidup di belakang, jadi langkah kedua masih bisa jalan.

Langkah kedua dilindungi dua pemicu: timer 900 ms, dan event
`visibilitychange` saat pemain kembali ke browser. Penjaga `sudah` memastikan
langkah itu hanya berjalan sekali. Ini mengatasi pembatasan timer latar
belakang di Android dan iOS.

### Mengapa bukan iframe

Versi sebelumnya menembakkan langkah 1 lewat `<iframe>` tersembunyi, dengan
alasan iframe tidak mengambil alih navigasi. Diuji di perangkat nyata:
**pemain masuk server tetapi server tidak tersimpan.** Browser mobile
memblokir skema kustom di dalam iframe secara diam-diam — tidak ada error,
hanya tidak terjadi apa-apa.

Rute `/t1` mempertahankan perilaku iframe itu untuk perbandingan.

## Mengapa deteksi perangkat ada di browser, bukan di server

Versi awal memilih respons di sisi server berdasarkan header `User-Agent`:
Bedrock dapat redirect, desktop dapat `servers.dat`. Ini **gagal di produksi** —
pemain Android menerima unduhan `servers.dat`.

Penyebabnya CDN. Bukti dari header respons Vercel:

```
x-vercel-cache: HIT
age: 45
content-type: application/octet-stream
```

Permintaan pertama yang lewat kebetulan datang dari desktop, jadi edge menyimpan
varian biner itu untuk URL `/`, lalu menyajikannya ke **semua** perangkat
berikutnya termasuk ponsel.

Perbaikannya dua lapis:

1. Rute `/` sekarang selalu mengembalikan **satu respons HTML yang identik**
   untuk setiap perangkat — diverifikasi md5 sama di 7 User-Agent berbeda.
   Percabangan Bedrock/Java terjadi di browser lewat `navigator.userAgent`.
2. Semua respons memakai `Cache-Control: no-store, no-cache, must-revalidate`
   dan `Vary: User-Agent`.

Karena hanya ada satu varian, tidak ada lagi yang bisa tertukar. Pemain Java
tetap dapat file-nya: browser mendeteksi desktop lalu mengalihkan ke
`/servers.dat`.

## Data server (sudah diverifikasi live)

| Item | Nilai |
|---|---|
| Host | `play.konohaserver.id` → `139.162.24.73` |
| Java | TCP `25565` — terverifikasi terbuka |
| Bedrock | UDP `19132` — menjawab `MCPE;KONOHA Network \| Survival` |

## Deploy ke Cloudflare Workers

```
cd konoha-add
npx wrangler deploy
```

Lalu di dashboard: **Workers & Pages → konoha-add → Settings → Domains & Routes
→ Add Custom Domain** → masukkan `add.konohaserver.id`.

Kalau zona `konohaserver.id` sudah ada di akun Cloudflare yang sama, buka
komentar bagian `routes` di `wrangler.toml` dan cukup jalankan `npx wrangler deploy`.

## Deploy ke Vercel

```
cd konoha-add
vercel --prod
```

Lalu **Settings → Domains** → tambah `add.konohaserver.id`. DNS yang dibutuhkan:

```
Type: CNAME    Name: add    Value: cname.vercel-dns.com
```

`vercel.json` sudah mengarahkan semua jalur ke `api/index.js`.

## Uji sebelum deploy

```
node tools/test_redirect.js   # logika Worker — 24 uji
node tools/test_vercel.js     # handler Vercel — 16 uji
npx wrangler dev --local      # runtime Cloudflare asli di localhost:8787
```

Contoh uji manual dengan User-Agent Android:

```
curl -sI -A "Mozilla/5.0 (Linux; Android 14) Mobile" http://127.0.0.1:8787/
```

Harus mengembalikan `302` dengan header `Location: minecraft://?addExternalServer=...`.

## Cara mengubah host atau nama server

Ubah `CFG` di **tiga** tempat agar konsisten:

- `worker/lib.js` (Cloudflare)
- `api/index.js` (Vercel)
- `tools/make_servers_dat.py` (untuk membuat ulang `servers.dat`)

Setelah mengubah host, buat ulang `servers.dat` dan perbarui base64-nya:

```
python3 tools/make_servers_dat.py
python3 -c "import base64;print(base64.b64encode(open('public/servers.dat','rb').read()).decode())"
```

Tempel hasilnya ke `SERVERS_DAT_B64` di `worker/lib.js` dan `api/index.js`.

## Batasan yang jujur

**Menyimpan server: bekerja satu klik.** `addExternalServer` adalah skema resmi
Microsoft, terdokumentasi di Microsoft Learn. Terverifikasi di perangkat nyata.

**Sambung langsung: bekerja satu klik.** `connect?serverUrl=...&serverPort=...`
terverifikasi masuk dunia tanpa perantara.

**Dua argumen dalam satu URI: TIDAK bekerja.** Diuji di perangkat nyata —
Minecraft memproses argumen pertama saja dan mengabaikan sisanya.

**Skema kustom di dalam `<iframe>`: TIDAK bekerja.** Diuji di perangkat nyata —
pemain masuk server tetapi server tidak tersimpan. Browser mobile memblokirnya
tanpa pesan error. Hanya navigasi tingkat atas yang bisa dipercaya.

**Java tidak punya skema URI.** Tidak ada cara satu klik yang resmi. Pemain Java
menerima `servers.dat` (88 byte) untuk ditaruh di folder `.minecraft`.
Peringatkan pemain: jangan timpa file lama kalau daftar server mereka sudah berisi.

**iOS** memblokir skema non-http di browser dalam aplikasi (Instagram, TikTok).
Link harus dibuka di Safari.

**Konsol** (Xbox, PlayStation, Switch) tidak mendukung deep link maupun server
pihak ketiga. Pemain konsol butuh BedrockConnect atau perubahan DNS.

## Berkas

| Berkas | Fungsi |
|---|---|
| `worker/index.js` | Titik masuk Cloudflare Worker (hanya default export) |
| `worker/lib.js` | Logika pengalih: bangun link, kenali perangkat, rute |
| `api/index.js` | Titik masuk Vercel, logika sama |
| `wrangler.toml` | Konfigurasi Cloudflare |
| `vercel.json` | Rewrite semua jalur ke fungsi |
| `public/servers.dat` | File Java 88 byte, NBT tak terkompresi |
| `tools/make_servers_dat.py` | Generator `servers.dat` + parser verifikasi |
| `tools/test_redirect.js` | 24 uji logika Worker |
| `tools/test_vercel.js` | 16 uji handler Vercel |
| `tools/worker_cjs.js` | Salinan CommonJS `lib.js` untuk diuji Node |

## Catatan teknis

File utama Worker hanya boleh mengekspor `default`. Mengekspor nilai biasa
(string, objek) dari file utama membuat runtime menolak start dengan
`Incorrect type for map entry ... not of type 'function or ExportedHandler'`.
Karena itu logika dipisah ke `worker/lib.js`.
