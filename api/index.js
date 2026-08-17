/**
 * Titik masuk Vercel (Node.js serverless function) untuk add.konohaserver.id.
 * Logika sama dengan Worker Cloudflare, hanya beda API request/response.
 *
 * CATATAN HASIL UJI PERANGKAT NYATA:
 * 1. URI gabungan `connect?...&addExternalServer=...` gagal — argumen pertama saja.
 * 2. Percabangan User-Agent di server gagal — CDN menyajikan varian salah.
 * 3. Skema kustom lewat <iframe> gagal menyimpan — browser mobile memblokirnya.
 *    Hanya navigasi tingkat atas (location.href) yang bekerja.
 */

"use strict";

const CFG = {
  nama: "KONOHA Network",
  host: "play.konohaserver.id",
  portBedrock: "19132",
  portJava: "25565",
};

const SERVERS_DAT_B64 =
  "CgAACQAHc2VydmVycwoAAAABCAACaXAAFHBsYXkua29ub2hhc2VydmVyLmlkCAAEbmFtZQAOS09OT0hBIE5ldHdvcmsBAA5hY2NlcHRUZXh0dXJlcwEAAA==";

function buatLink(cfg) {
  const namaEnc = encodeURIComponent(cfg.nama);
  const alamat = `${cfg.host}:${cfg.portBedrock}`;
  return {
    simpan: `minecraft://?addExternalServer=${namaEnc}|${alamat}`,
    sambung:
      `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
      `&serverPort=${cfg.portBedrock}`,
    keduanya:
      `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
      `&serverPort=${cfg.portBedrock}` +
      `&addExternalServer=${namaEnc}|${alamat}`,
  };
}

/**
 * Halaman perantara tak terlihat: dua navigasi tingkat atas berurutan.
 * Iframe tidak dipakai lagi karena browser mobile memblokir skema kustom di sana.
 */
function halamanRantai(pertama, kedua, jeda, cabangJava, pakaiIframe) {
  return `<!DOCTYPE html>
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

  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/i.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var windows = /Windows/i.test(ua);
  var bedrock = iOS || android || windows;

  if (CABANG && !bedrock) {
    location.replace("/servers.dat");
    return;
  }

  if (IFRAME) {
    try { document.getElementById("f").src = PERTAMA; } catch (e) {}
  } else {
    location.href = PERTAMA;
  }

  var sudah = false;
  function langkahDua() {
    if (sudah) return;
    sudah = true;
    location.href = KEDUA;
  }

  setTimeout(langkahDua, JEDA);

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) setTimeout(langkahDua, 250);
  });
})();
</script>
</body></html>`;
}

module.exports = function handler(req, res) {
  const potong = (req.url || "/").split("?");
  const jalur = potong[0].replace(/\/+$/, "") || "/";
  const kueri = new URLSearchParams(potong[1] || "");
  const jeda = Math.min(5000, Math.max(0, parseInt(kueri.get("jeda") || "900", 10) || 900));
  const link = buatLink(CFG);

  function tanpaCache() {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Vary", "User-Agent");
  }

  function alihkan(tujuan) {
    res.statusCode = 302;
    res.setHeader("Location", tujuan);
    tanpaCache();
    res.setHeader("Referrer-Policy", "no-referrer");
    res.end();
  }

  function kirimServersDat() {
    const biner = Buffer.from(SERVERS_DAT_B64, "base64");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="servers.dat"');
    tanpaCache();
    res.end(biner);
  }

  function kirimRantai(pertama, kedua, cabangJava, pakaiIframe) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    tanpaCache();
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(halamanRantai(pertama, kedua, jeda, cabangJava, pakaiIframe));
  }

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
      return kirimRantai(link.simpan, link.sambung, false, true);
    case "/t2":
      return kirimRantai(link.simpan, link.sambung, false, false);
    case "/t3":
      return kirimRantai(link.sambung, link.simpan, false, false);
    case "/":
      return kirimRantai(link.simpan, link.sambung, true, false);
    default:
      return alihkan("/");
  }
};
