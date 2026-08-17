/**
 * Inti logika pengalih add.konohaserver.id.
 *
 * Dipisah dari titik masuk Worker karena Cloudflare Workers memperlakukan
 * setiap named export di file utama sebagai entrypoint — export nilai biasa
 * (string/objek) di sana membuat runtime menolak start.
 *
 * CATATAN HASIL UJI PERANGKAT NYATA (jangan diulang salahnya):
 *
 * 1. Satu URI gabungan `connect?...&addExternalServer=...` GAGAL.
 *    Minecraft memproses argumen pertama saja.
 *
 * 2. Percabangan Bedrock/Java di SISI SERVER lewat header User-Agent GAGAL.
 *    CDN menyimpan satu varian per URL lalu menyajikannya ke semua perangkat,
 *    sehingga pemain Android menerima unduhan servers.dat. Sekarang rute "/"
 *    selalu satu respons HTML identik; percabangan terjadi di browser.
 *
 * 3. Menembakkan skema lewat <iframe> GAGAL menyimpan server. Browser mobile
 *    memblokir skema kustom di dalam iframe. Yang terbukti bekerja hanyalah
 *    NAVIGASI TINGKAT ATAS (location.href / redirect 302):
 *      - `?addExternalServer=` lewat navigasi -> server tersimpan
 *      - `connect?serverUrl=`  lewat navigasi -> pemain masuk dunia
 *    Karena itu kedua langkah kini memakai navigasi tingkat atas berurutan.
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
  // Terbukti GAGAL di perangkat nyata — disimpan hanya untuk rujukan.
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

/** Header anti-cache untuk semua respons yang bisa berbeda per perangkat. */
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
 * Halaman perantara tak terlihat: dua NAVIGASI TINGKAT ATAS berurutan.
 *
 * Navigasi ke skema kustom tidak membongkar halaman di browser mobile —
 * aplikasi terbuka, halaman tetap hidup di belakang. Jadi langkah kedua masih
 * bisa dijalankan. Iframe tidak dipakai lagi karena diblokir.
 *
 * Langkah kedua ditembakkan dua kali: sekali lewat timer, dan sekali lagi saat
 * halaman kembali terlihat (pemain balik ke browser). Ini mengatasi pembatasan
 * timer latar belakang di Android/iOS.
 *
 * @param {string} pertama URI langkah pertama
 * @param {string} kedua   URI langkah kedua
 * @param {number} jeda    milidetik antar langkah
 * @param {boolean} cabangJava true = desktop non-Windows dialihkan ke servers.dat
 * @param {boolean} pakaiIframe true = langkah pertama lewat iframe (mode uji)
 */
function halamanRantai(pertama, kedua, jeda = 900, cabangJava = true, pakaiIframe = false) {
  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>KONOHA Network</title>
<style>html,body{margin:0;height:100%;background:#0b0d10}iframe{display:none}</style>
</head><body>
<iframe id="f" referrerpolicy="no-referrer"></iframe>
<script>
(function(){
  "use strict";
  var PERTAMA = ${JSON.stringify(pertama)};
  var KEDUA   = ${JSON.stringify(kedua)};
  var JEDA    = ${jeda};
  var CABANG  = ${cabangJava ? "true" : "false"};
  var IFRAME  = ${pakaiIframe ? "true" : "false"};

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

  // Langkah 1. Navigasi tingkat atas: satu-satunya cara yang terbukti bekerja.
  if (IFRAME) {
    try { document.getElementById("f").src = PERTAMA; } catch (e) {}
  } else {
    location.href = PERTAMA;
  }

  // Langkah 2, ditembakkan sekali saja lewat dua pemicu berbeda.
  var sudah = false;
  function langkahDua() {
    if (sudah) return;
    sudah = true;
    location.href = KEDUA;
  }

  // Pemicu A: timer biasa.
  setTimeout(langkahDua, JEDA);

  // Pemicu B: saat halaman kembali terlihat. Timer latar belakang dibatasi
  // Android/iOS, jadi ini jaring pengaman bila pemicu A terlambat.
  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) setTimeout(langkahDua, 250);
  });
})();
</script>
</body></html>`;
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
 *   /            Simpan lalu masuk, dua navigasi tingkat atas. Java -> servers.dat.
 *   /t1          Uji: simpan lewat iframe (terbukti gagal menyimpan).
 *   /t2          Uji: simpan -> masuk, keduanya navigasi (sama dengan /).
 *   /t3          Uji: masuk -> simpan, urutan dibalik.
 *   /join        Hanya masuk. Terbukti bekerja.
 *   /save        Hanya simpan. Terbukti bekerja.
 *   /both        Dua argumen satu URI. Terbukti gagal, disimpan untuk rujukan.
 *   /servers.dat File untuk pemain Java.
 *   /java        Paksa jalur Java.
 */
function tangani(request) {
  const url = new URL(request.url);
  const jalur = url.pathname.replace(/\/+$/, "") || "/";
  const link = buatLink(CFG);
  // Jeda dapat disetel: ?jeda=1500 untuk perangkat lambat.
  const jeda = Math.min(
    5000,
    Math.max(0, parseInt(url.searchParams.get("jeda") || "900", 10) || 900)
  );

  switch (jalur) {
    case "/servers.dat":
    case "/java":
      return kirimServersDat();

    case "/join":
      return alihkan(link.sambung);

    case "/save":
      return alihkan(link.simpan);

    case "/both":
      return alihkan(link.keduanya);

    case "/t1":
      return halamanRantai(link.simpan, link.sambung, jeda, false, true);

    case "/t2":
      return halamanRantai(link.simpan, link.sambung, jeda, false, false);

    case "/t3":
      return halamanRantai(link.sambung, link.simpan, jeda, false, false);

    case "/":
      // Satu varian untuk semua perangkat; percabangan terjadi di browser.
      return halamanRantai(link.simpan, link.sambung, jeda, true, false);

    default:
      return alihkan("/");
  }
}

module.exports = { CFG, SERVERS_DAT_B64, buatLink, kenaliPerangkat, tangani };
