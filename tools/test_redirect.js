#!/usr/bin/env node
/**
 * Uji logika worker/lib.js (lewat salinan CommonJS) dengan Request/Response
 * bawaan Node 18+.
 *
 * Fokus v5:
 *  - rute "/" identik untuk semua User-Agent (anti bocor cache CDN)
 *  - langkah 1 ditembakkan SEGERA (location.href = L1 sebelum timer)
 *  - jeda default 150 ms
 *  - jaring pengaman visibilitychange ada
 *  - tidak ada iframe
 */
"use strict";

const { tangani, buatLink, CFG, SERVERS_DAT_B64 } = require("./worker_cjs.js");

let gagal = 0;
function periksa(nama, dapat, harap) {
  const ok = String(dapat) === String(harap);
  if (!ok) gagal++;
  console.log(`${ok ? "LULUS" : "GAGAL"}  ${nama}`);
  if (!ok) {
    console.log("   dapat :", dapat);
    console.log("   harap :", harap);
  }
}

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  kosong: "",
  telegram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Telegram-iOS/10.9",
  bot: "TelegramBot (like TwitterBot)",
};

function minta(jalur, ua) {
  return tangani(
    new Request("https://add.konohaserver.id" + jalur, {
      headers: { "user-agent": ua === undefined ? UA.android : ua },
    })
  );
}

const SIMPAN = "minecraft://?addExternalServer=KONOHA%20Network|play.konohaserver.id:19132";
const SAMBUNG = "minecraft://connect?serverUrl=play.konohaserver.id&serverPort=19132";

(async () => {
  const link = buatLink(CFG);

  console.log("=== Format link ===");
  periksa("skema simpan sesuai dokumentasi Microsoft", link.simpan, SIMPAN);
  periksa("skema sambung sesuai dokumentasi Microsoft", link.sambung, SAMBUNG);
  console.log();

  console.log("=== Rute / identik untuk SEMUA perangkat (anti bocor cache) ===");
  {
    const acuan = await minta("/", UA.android).text();
    for (const nama of Object.keys(UA)) {
      const r = minta("/", UA[nama]);
      const b = await r.text();
      periksa(`${nama}: 200 HTML`,
        `${r.status} ${r.headers.get("content-type")}`, "200 text/html; charset=utf-8");
      periksa(`${nama}: isi identik`, b === acuan, true);
    }
  }
  console.log();

  console.log("=== Header anti-cache ===");
  for (const jalur of ["/", "/r", "/save", "/join", "/both", "/servers.dat", "/java"]) {
    const r = minta(jalur, UA.android);
    periksa(`${jalur}: no-store`, r.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate");
    periksa(`${jalur}: Vary User-Agent`, r.headers.get("vary"), "User-Agent");
  }
  console.log();

  console.log("=== Isi halaman rantai v5 ===");
  {
    const b = await minta("/", UA.android).text();
    periksa("dua skema ada", b.includes(SIMPAN) && b.includes(SAMBUNG), true);
    periksa("TIDAK ada iframe", b.includes("<iframe"), false);
    periksa("langkah 1 navigasi segera", b.includes("location.href = L1"), true);
    periksa("langkah 2 navigasi", b.includes("location.href = L2"), true);
    periksa("jeda default 150", b.includes("var JEDA = 150"), true);
    periksa("jaring pengaman visibilitychange", b.includes("visibilitychange"), true);
    periksa("penjaga anti-dobel", b.includes("if (sudah) return;"), true);
    periksa("cabang Java aktif di /", b.includes("var CABANG = true"), true);
    periksa("deteksi di browser", b.includes("navigator.userAgent"), true);
    periksa("iPad UA-desktop tertangani", b.includes("maxTouchPoints"), true);
    periksa("Java dialihkan ke /servers.dat", b.includes('location.replace("/servers.dat")'), true);
    periksa("tanpa tombol", b.includes("<button"), false);
    periksa("tanpa tautan", b.includes("<a "), false);
    periksa("noindex", b.includes('name="robots" content="noindex"'), true);
    periksa("referrer disembunyikan", b.includes('name="referrer" content="no-referrer"'), true);
    periksa("URI ditulis literal JSON", b.includes('"minecraft://'), true);
  }
  {
    const b = await minta("/r", UA.android).text();
    periksa("/r: cabang Java mati", b.includes("var CABANG = false"), true);
    periksa("/r: urutan dibalik", b.indexOf("L1 = " + JSON.stringify(SAMBUNG)) >= 0, true);
  }
  {
    periksa("?jeda=300 dihormati",
      (await minta("/?jeda=300", UA.android).text()).includes("var JEDA = 300"), true);
    periksa("?jeda=99999 dibatasi 5000",
      (await minta("/?jeda=99999", UA.android).text()).includes("var JEDA = 5000"), true);
    periksa("?jeda=abc pakai default 150",
      (await minta("/?jeda=abc", UA.android).text()).includes("var JEDA = 150"), true);
  }
  console.log();

  console.log("=== Rute tunggal ===");
  periksa("/save -> 302 simpan", minta("/save", UA.android).headers.get("location"), SIMPAN);
  periksa("/join -> 302 sambung", minta("/join", UA.android).headers.get("location"), SAMBUNG);
  {
    const l = minta("/both", UA.android).headers.get("location");
    periksa("/both punya dua argumen (rujukan)",
      l.includes("serverUrl=") && l.includes("addExternalServer="), true);
  }
  periksa("jalur asing -> /", minta("/entah", UA.android).headers.get("location"), "/");
  periksa("garis miring akhir", minta("/join/", UA.android).headers.get("location"), SAMBUNG);
  console.log();

  console.log("=== servers.dat ===");
  {
    const r = minta("/servers.dat", UA.linux);
    periksa("status 200", r.status, 200);
    periksa("tipe biner", r.headers.get("content-type"), "application/octet-stream");
    periksa("header unduhan", r.headers.get("content-disposition"),
      'attachment; filename="servers.dat"');
    const buf = Buffer.from(await r.arrayBuffer());
    periksa("88 byte", buf.length, 88);
  }
  {
    const a = Buffer.from(await minta("/java", UA.linux).arrayBuffer());
    const b = Buffer.from(await minta("/servers.dat", UA.linux).arrayBuffer());
    periksa("/java sama dengan /servers.dat", a.equals(b), true);
  }
  console.log();

  console.log("=== Keutuhan servers.dat ===");
  {
    const biner = Buffer.from(SERVERS_DAT_B64, "base64");
    periksa("panjang 88 byte", biner.length, 88);
    periksa("byte pertama TAG_Compound", biner[0], 10);
    periksa("byte terakhir TAG_End", biner[biner.length - 1], 0);
    periksa("host baru ada", biner.includes(Buffer.from("play.konohaserver.id")), true);
    periksa("nama server ada", biner.includes(Buffer.from("KONOHA Network")), true);
    periksa("tidak ada host lama", biner.includes(Buffer.from("konohanetwork")), false);
  }

  console.log();
  console.log(gagal === 0 ? "SEMUA UJI LULUS" : `${gagal} UJI GAGAL`);
  process.exit(gagal === 0 ? 0 : 1);
})();
