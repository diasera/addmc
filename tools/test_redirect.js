#!/usr/bin/env node
/**
 * Uji logika Worker Cloudflare (worker/lib.js lewat salinan CommonJS).
 * Memakai Request/Response bawaan Node 18+.
 *
 * Fokus utama: rute "/" harus mengembalikan respons IDENTIK untuk semua
 * User-Agent, supaya CDN tidak bisa menyajikan varian perangkat yang salah.
 */
"use strict";

const { tangani, buatLink, kenaliPerangkat, CFG, SERVERS_DAT_B64 } = require("./worker_cjs.js");

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
  periksa("pemisah | literal", link.simpan.includes("|"), true);
  periksa("spasi nama jadi %20", link.simpan.includes("KONOHA%20Network"), true);
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
  for (const jalur of ["/", "/t1", "/t2", "/t3", "/join", "/save", "/servers.dat", "/java", "/both"]) {
    const r = minta(jalur, UA.android);
    periksa(`${jalur}: no-store`, r.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate");
    periksa(`${jalur}: Vary User-Agent`, r.headers.get("vary"), "User-Agent");
  }
  console.log();

  console.log("=== Isi halaman rantai ===");
  {
    const b = await minta("/", UA.android).text();
    periksa("dua skema ada", b.includes(SIMPAN) && b.includes(SAMBUNG), true);
    periksa("langkah 2 pakai navigasi", b.includes("location.href = KEDUA"), true);
    periksa("location.replace dipakai", b.includes("location.replace"), true);
    periksa("cabang Java aktif di /", b.includes("var CABANG  = true"), true);
    periksa("deteksi di browser", b.includes("navigator.userAgent"), true);
    periksa("Java dialihkan ke /servers.dat", b.includes('location.replace("/servers.dat")'), true);
    periksa("iPad UA-desktop tertangani", b.includes("maxTouchPoints"), true);
    periksa("tanpa tombol", b.includes("<button"), false);
    periksa("noindex", b.includes('name="robots" content="noindex"'), true);
  }
  {
    const b = await minta("/t2", UA.android).text();
    periksa("/t2: cabang Java mati", b.includes("var CABANG  = false"), true);
    periksa("/t2: simpan dulu", b.indexOf("PERTAMA = " + JSON.stringify(SIMPAN)) >= 0, true);
  }
  {
    const b = await minta("/t3", UA.android).text();
    periksa("/t3: sambung dulu", b.indexOf("PERTAMA = " + JSON.stringify(SAMBUNG)) >= 0, true);
  }
  {
    periksa("?jeda=1500 dihormati",
      (await minta("/?jeda=1500", UA.android).text()).includes("var JEDA    = 1500"), true);
    periksa("?jeda=99999 dibatasi 5000",
      (await minta("/?jeda=99999", UA.android).text()).includes("var JEDA    = 5000"), true);
    periksa("?jeda=abc pakai default 900",
      (await minta("/?jeda=abc", UA.android).text()).includes("var JEDA    = 900"), true);
  }
  console.log();

  console.log("=== Rute tunggal ===");
  periksa("/join -> 302 sambung", minta("/join", UA.android).headers.get("location"), SAMBUNG);
  periksa("/save -> 302 simpan", minta("/save", UA.iphone).headers.get("location"), SIMPAN);
  {
    const l = minta("/both", UA.android).headers.get("location");
    periksa("/both punya dua argumen",
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

  console.log("=== kenaliPerangkat (dipakai rujukan, bukan rute /) ===");
  const HARAP = { android: "BEDROCK", iphone: "BEDROCK", windows: "BEDROCK", linux: "JAVA", mac: "JAVA" };
  for (const [nama, harap] of Object.entries(HARAP)) {
    const d = kenaliPerangkat(UA[nama]);
    periksa(`${nama} -> ${harap}`, d.bedrock ? "BEDROCK" : "JAVA", harap);
  }

  console.log();
  console.log(gagal === 0 ? "SEMUA UJI LULUS" : `${gagal} UJI GAGAL`);
  process.exit(gagal === 0 ? 0 : 1);
})();
