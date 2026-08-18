/**
 * Inti logika add.konohaserver.id — dibangun ulang dari nol (v5).
 *
 * FAKTA HASIL UJI PERANGKAT NYATA (dasar desain ini):
 *
 *  1. `minecraft://?addExternalServer=Nama|host:port` lewat navigasi tingkat
 *     atas  -> server TERSIMPAN. TERBUKTI.
 *  2. `minecraft://connect?serverUrl=host&serverPort=19132` lewat navigasi
 *     tingkat atas -> pemain MASUK DUNIA. TERBUKTI.
 *  3. Kedua argumen digabung dalam satu URI -> GAGAL (argumen pertama saja).
 *  4. Skema kustom di dalam <iframe> -> GAGAL (diblokir senyap).
 *  5. Dua navigasi berjarak 900 ms -> langkah pertama jalan, langkah kedua
 *     GAGAL. Penyebab: Minecraft sudah mengambil layar, Chrome kebelakang,
 *     Android melarang startActivity dari proses latar belakang.
 *
 * STRATEGI BARU (v5):
 *  Tembakkan langkah kedua saat Chrome MASIH DI DEPAN — sekitar 150 ms setelah
 *  langkah pertama, sebelum aktivitas Minecraft sempat tampil. Kedua intent
 *  terkirim ke Android berurutan; Minecraft memprosesnya satu per satu.
 *
 *  Jaring pengaman: bila langkah kedua terlewat, event `visibilitychange`
 *  menembakkannya lagi begitu pemain kembali ke browser (browser di depan lagi).
 *  Penjaga `sudah` mencegah dobel.
 */

"use strict";

const CFG = {
  nama: "KONOHA Network",
  host: "play.konohaserver.id",
  portBedrock: "19132",
  portJava: "25565",
};

/** servers.dat (NBT tak terkompresi) untuk Minecraft Java, disimpan base64. */
const SERVERS_DAT_B64 =
  "CgAACQAHc2VydmVycwoAAAABCAACaXAAFHBsYXkua29ub2hhc2VydmVyLmlkCAAEbmFtZQAOS09OT0hBIE5ldHdvcmsBAA5hY2NlcHRUZXh0dXJlcwEAAA==";

/** Bangun semua bentuk deep link dari satu sumber konfigurasi. */
function buatLink(cfg = CFG) {
  const namaEnc = encodeURIComponent(cfg.nama);
  const alamat = `${cfg.host}:${cfg.portBedrock}`;
  const simpan = `minecraft://?addExternalServer=${namaEnc}|${alamat}`;
  const sambung =
    `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
    `&serverPort=${cfg.portBedrock}`;
  const keduanya =
    `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
    `&serverPort=${cfg.portBedrock}` +
    `&addExternalServer=${namaEnc}|${alamat}`;
  return { simpan, sambung, keduanya };
}

/** Kenali jenis perangkat dari User-Agent. Tidak dipakai rute "/". */
function kenaliPerangkat(ua = "") {
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const windows = /Windows NT/i.test(ua);
  const mac = /Macintosh/i.test(ua) && !iOS;
  const bedrock = iOS || android || windows;
  return { iOS, android, windows, mac, bedrock, java: !bedrock };
}

/** Anti-cache: semua respons bisa berbeda per perangkat/kueri. */
const TANPA_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Vary: "User-Agent",
};

function alihkan(tujuan) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: tujuan,
      ...TANPA_CACHE,
      "Referrer-Policy": "no-referrer",
    },
  });
}

function kirimServersDat() {
  const biner = Uint8Array.from(atob(SERVERS_DAT_B64), (c) => c.charCodeAt(0));
  return new Response(biner, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="servers.dat"',
      ...TANPA_CACHE,
    },
  });
}

/**
 * Halaman perantara tanpa tampilan: dua navigasi tingkat atas berurutan.
 *
 * - Langkah 1 ditembakkan SEGERA saat skrip diparsing (bukan setelah load
 *   event), memakai `location.href` (bukan replace) supaya halaman tetap ada
 *   di riwayat — back dari Minecraft mengembalikan pemain ke sini, dan jaring
 *   pengaman bisa menembakkan langkah 2.
 * - Langkah 2 ditembakkan setelah `jeda` ms, plus jaring pengaman
 *   `visibilitychange`. Penjaga `sudah` memastikan hanya sekali.
 *
 * @param {string} langkah1 URI pertama
 * @param {string} langkah2 URI kedua
 * @param {number} jeda     milidetik antar langkah (default 150)
 * @param {boolean} cabangJava true = desktop non-Windows dialihkan ke servers.dat
 */
function halamanRantai(langkah1, langkah2, jeda = 150, cabangJava = true) {
  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>KONOHA Network</title>
<style>html,body{margin:0;height:100%;background:#0b0d10}</style>
<script>
(function(){
  "use strict";
  var L1 = ${JSON.stringify(langkah1)};
  var L2 = ${JSON.stringify(langkah2)};
  var JEDA = ${jeda};
  var CABANG = ${cabangJava ? "true" : "false"};

  // Keputusan platform di BROWSER, bukan server, supaya CDN tidak bisa
  // menyajikan varian perangkat yang salah.
  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/i.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var windows = /Windows/i.test(ua);
  var bedrock = iOS || android || windows;

  if (CABANG && !bedrock) {
    // Minecraft Java tidak punya skema URI: kirim daftar server sebagai file.
    location.replace("/servers.dat");
    return;
  }

  var sudah = false;
  function langkahDua() {
    if (sudah) return;
    sudah = true;
    location.href = L2;
  }

  // Langkah 1: SEGERA, selagi browser di depan.
  location.href = L1;

  // Langkah 2: selagi Chrome masih di depan (sebelum Minecraft tampil).
  setTimeout(langkahDua, JEDA);

  // Jaring pengaman: pemain kembali ke browser -> browser di depan lagi ->
  // langkah 2 boleh ditembakkan.
  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) setTimeout(langkahDua, 200);
  });
})();
</script>
</head><body></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...TANPA_CACHE,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Penanganan permintaan.
 *
 *   /            SIMPAN lalu MASUK (jeda default 150 ms, bisa ?jeda=N).
 *   /r           Urutan dibalik: MASUK lalu SIMPAN.
 *   /save        Hanya simpan (302). Terbukti bekerja.
 *   /join        Hanya masuk (302). Terbukti bekerja.
 *   /both        Dua argumen satu URI (302). Terbukti gagal, untuk rujukan.
 *   /servers.dat File untuk pemain Java.
 *   /java        Paksa jalur Java.
 */
function tangani(request) {
  const url = new URL(request.url);
  const jalur = url.pathname.replace(/\/+$/, "") || "/";
  const link = buatLink(CFG);
  // Jeda dapat disetel: ?jeda=50 untuk perangkat cepat, ?jeda=400 bila lambat.
  const jeda = Math.min(
    5000,
    Math.max(0, parseInt(url.searchParams.get("jeda") || "150", 10) || 150)
  );

  switch (jalur) {
    case "/servers.dat":
    case "/java":
      return kirimServersDat();

    case "/save":
      return alihkan(link.simpan);

    case "/join":
      return alihkan(link.sambung);

    case "/both":
      return alihkan(link.keduanya);

    case "/r":
      return halamanRantai(link.sambung, link.simpan, jeda, false);

    case "/":
      // Satu varian untuk semua perangkat; percabangan terjadi di browser.
      return halamanRantai(link.simpan, link.sambung, jeda, true);

    default:
      return alihkan("/");
  }
}

module.exports = { CFG, SERVERS_DAT_B64, buatLink, kenaliPerangkat, tangani };
