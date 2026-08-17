/**
 * Inti logika pengalih add.konohaserver.id.
 *
 * Dipisah dari titik masuk Worker karena Cloudflare Workers memperlakukan
 * setiap named export di file utama sebagai entrypoint — export nilai biasa
 * (string/objek) di sana membuat runtime menolak start.
 *
 * PENTING — pelajaran dari kejadian nyata:
 * Rute "/" dulu memilih respons berdasarkan User-Agent di sisi server. CDN
 * (Vercel Edge) menyimpan varian pertama yang lewat, lalu menyajikannya ke semua
 * perangkat. Akibatnya pemain Android menerima unduhan servers.dat milik
 * desktop. Sekarang "/" SELALU mengembalikan satu respons HTML yang sama, dan
 * keputusan Bedrock/Java dilakukan di browser. Satu varian = mustahil tertukar.
 */

"use strict";

export const CFG = {
  nama: "KONOHA Network",
  host: "play.konohaserver.id",
  portBedrock: "19132",
  portJava: "25565",
};

/** servers.dat (NBT tak terkompresi) untuk Minecraft Java, disimpan base64. */
export const SERVERS_DAT_B64 =
  "CgAACQAHc2VydmVycwoAAAABCAACaXAAFHBsYXkua29ub2hhc2VydmVyLmlkCAAEbmFtZQAOS09OT0hBIE5ldHdvcmsBAA5hY2NlcHRUZXh0dXJlcwEAAA==";

/** Bangun semua bentuk deep link dari satu sumber konfigurasi. */
export function buatLink(cfg = CFG) {
  const namaEnc = encodeURIComponent(cfg.nama);
  const alamat = `${cfg.host}:${cfg.portBedrock}`;
  const simpan = `minecraft://?addExternalServer=${namaEnc}|${alamat}`;
  const sambung =
    `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
    `&serverPort=${cfg.portBedrock}`;
  // Gabungan dua argumen dalam satu URI. Terbukti TIDAK bekerja pada perangkat
  // nyata (Minecraft memproses argumen pertama saja) — disimpan untuk rujukan.
  const keduanya =
    `minecraft://connect?serverUrl=${encodeURIComponent(cfg.host)}` +
    `&serverPort=${cfg.portBedrock}` +
    `&addExternalServer=${namaEnc}|${alamat}`;
  return { simpan, sambung, keduanya };
}

/** Kenali jenis perangkat dari User-Agent. Hanya dipakai rute non-"/" . */
export function kenaliPerangkat(ua = "") {
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const windows = /Windows NT/i.test(ua);
  const mac = /Macintosh/i.test(ua) && !iOS;
  // Bedrock tersedia di Android, iOS, dan Windows. Desktop lain dianggap Java.
  const bedrock = iOS || android || windows;
  return { iOS, android, windows, mac, bedrock, java: !bedrock };
}

/** Header anti-cache dipakai semua respons yang bisa berbeda per perangkat. */
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
 * Halaman perantara tak terlihat.
 *
 * Bedrock: menembakkan dua skema berurutan supaya server tersimpan DAN pemain
 * langsung masuk dunia. Satu respons HTTP hanya bisa memuat satu Location, dan
 * menggabungkan `addExternalServer` + `connect` dalam satu URI terbukti gagal.
 * Karena itu skema pertama ditembakkan lewat iframe tersembunyi — iframe tidak
 * mengambil alih halaman, jadi navigasi kedua masih bisa dijalankan.
 *
 * Java (desktop non-Windows): halaman langsung memicu unduhan servers.dat.
 *
 * Tidak ada elemen yang terlihat: latar gelap, tanpa teks, tanpa tombol.
 *
 * @param {string} pertama URI yang ditembakkan lewat iframe
 * @param {string} kedua   URI untuk navigasi utama
 * @param {number} jeda    milidetik antara keduanya
 * @param {boolean} cabangJava true = deteksi Java di browser lalu unduh servers.dat
 */
function halamanRantai(pertama, kedua, jeda = 700, cabangJava = true) {
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

  // Keputusan platform dilakukan DI BROWSER, bukan di server, supaya CDN tidak
  // bisa menyajikan varian perangkat yang salah.
  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/i.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var windows = /Windows/i.test(ua);
  var bedrock = iOS || android || windows;

  if (CABANG && !bedrock) {
    // Desktop non-Windows: pemain Java. Minecraft Java tidak punya skema URI,
    // jadi langsung unduh daftar server.
    location.replace("/servers.dat");
    return;
  }

  // Langkah 1: simpan server lewat iframe (tidak menavigasi halaman).
  try { document.getElementById("f").src = PERTAMA; }
  catch (e) { /* sebagian browser menolak skema kustom di iframe */ }

  // Langkah 2: sambungkan ke server lewat navigasi utama.
  setTimeout(function(){ location.replace(KEDUA); }, JEDA);

  // Bila iframe diblokir, langkah 2 tetap jalan: pemain masuk server, hanya
  // penyimpanan daftar yang terlewat. Tidak ada instruksi yang perlu dibaca.
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
 *   /            Satu respons untuk semua perangkat. Bedrock: simpan + langsung
 *                masuk. Java: browser mengalihkan ke /servers.dat.
 *   /go          Paksa rantai Bedrock, tanpa cabang Java.
 *   /go2         Urutan dibalik: sambung dulu, simpan sesudahnya.
 *   /join        Hanya sambung langsung (terbukti bekerja).
 *   /save        Hanya simpan ke daftar server (terbukti bekerja).
 *   /both        Dua argumen satu URI — terbukti gagal, disimpan untuk rujukan.
 *   /servers.dat File untuk pemain Java.
 *   /java        Paksa jalur Java.
 */
export function tangani(request) {
  const url = new URL(request.url);
  const jalur = url.pathname.replace(/\/+$/, "") || "/";
  const link = buatLink(CFG);
  // Jeda dapat disetel lewat ?jeda=1200 untuk menguji perangkat lambat.
  const jeda = Math.min(
    5000,
    Math.max(0, parseInt(url.searchParams.get("jeda") || "700", 10) || 700)
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

    case "/go":
      return halamanRantai(link.simpan, link.sambung, jeda, false);

    case "/go2":
      return halamanRantai(link.sambung, link.simpan, jeda, false);

    case "/":
      // Satu varian untuk semua perangkat; percabangan terjadi di browser.
      return halamanRantai(link.simpan, link.sambung, jeda, true);

    default:
      return alihkan("/");
  }
}
