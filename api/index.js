/**
 * Titik masuk Vercel (Node.js serverless function) untuk add.konohaserver.id.
 * Logika sama dengan Worker Cloudflare, hanya beda API request/response.
 *
 * FAKTA HASIL UJI PERANGKAT NYATA:
 *  1. addExternalServer lewat navigasi -> TERSIMPAN (terbukti).
 *  2. connect lewat navigasi -> MASUK DUNIA (terbukti).
 *  3. Dua argumen satu URI -> gagal (argumen pertama saja).
 *  4. Skema kustom di <iframe> -> gagal (diblokir senyap).
 *  5. Dua navigasi 900 ms -> langkah kedua gagal (Chrome kebelakang,
 *     Android larang startActivity dari background).
 *
 * Strategi v5: langkah kedua ditembakkan 150 ms setelah langkah pertama,
 * selagi browser masih di depan. Jaring pengaman visibilitychange bila
 * pemain kembali ke browser.
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

function halamanRantai(langkah1, langkah2, jeda, cabangJava) {
  return `<!DOCTYPE html>
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

  var sudah = false;
  function langkahDua() {
    if (sudah) return;
    sudah = true;
    location.href = L2;
  }

  location.href = L1;
  setTimeout(langkahDua, JEDA);

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) setTimeout(langkahDua, 200);
  });
})();
</script>
</head><body></body></html>`;
}

module.exports = function handler(req, res) {
  const potong = (req.url || "/").split("?");
  const jalur = potong[0].replace(/\/+$/, "") || "/";
  const kueri = new URLSearchParams(potong[1] || "");
  const jeda = Math.min(5000, Math.max(0, parseInt(kueri.get("jeda") || "150", 10) || 150));
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

  function kirimRantai(langkah1, langkah2, cabangJava) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    tanpaCache();
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(halamanRantai(langkah1, langkah2, jeda, cabangJava));
  }

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
      return kirimRantai(link.sambung, link.simpan, false);
    case "/":
      return kirimRantai(link.simpan, link.sambung, true);
    default:
      return alihkan("/");
  }
};
