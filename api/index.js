/**
 * Titik masuk Vercel (Node.js serverless function) untuk add.konohaserver.id.
 * Logika sama dengan Worker Cloudflare, hanya beda API request/response.
 *
 * PENTING — pelajaran dari kejadian nyata:
 * Rute "/" dulu memilih respons berdasarkan User-Agent di sisi server. Vercel
 * Edge menyimpan varian pertama yang lewat lalu menyajikannya ke semua
 * perangkat, sehingga pemain Android menerima unduhan servers.dat milik desktop.
 * Sekarang "/" SELALU mengembalikan satu respons HTML yang sama dan keputusan
 * Bedrock/Java dilakukan di browser.
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
    // Terbukti gagal di perangkat nyata: Minecraft memproses argumen pertama saja.
    keduanya:
      `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
      `&serverPort=${cfg.portBedrock}` +
      `&addExternalServer=${namaEnc}|${alamat}`,
  };
}

/**
 * Halaman perantara tak terlihat. Percabangan Bedrock/Java terjadi di browser
 * supaya CDN tidak bisa menyajikan varian perangkat yang salah.
 */
function halamanRantai(pertama, kedua, jeda, cabangJava) {
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

  try { document.getElementById("f").src = PERTAMA; } catch (e) {}
  setTimeout(function(){ location.replace(KEDUA); }, JEDA);
})();
</script>
</body></html>`;
}

module.exports = function handler(req, res) {
  const potong = (req.url || "/").split("?");
  const jalur = potong[0].replace(/\/+$/, "") || "/";
  const kueri = new URLSearchParams(potong[1] || "");
  const jeda = Math.min(5000, Math.max(0, parseInt(kueri.get("jeda") || "700", 10) || 700));
  const link = buatLink(CFG);

  // Semua respons bisa berbeda per perangkat: jangan pernah di-cache CDN.
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

  function kirimRantai(pertama, kedua, cabangJava) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    tanpaCache();
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(halamanRantai(pertama, kedua, jeda, cabangJava));
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
    case "/go":
      return kirimRantai(link.simpan, link.sambung, false);
    case "/go2":
      return kirimRantai(link.sambung, link.simpan, false);
    case "/":
      // Satu varian untuk semua perangkat; percabangan terjadi di browser.
      return kirimRantai(link.simpan, link.sambung, true);
    default:
      return alihkan("/");
  }
};
