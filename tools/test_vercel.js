#!/usr/bin/env node
/**
 * Uji handler Vercel (api/index.js) dengan objek req/res palsu.
 *
 * Fokus utama: rute "/" harus mengembalikan respons IDENTIK untuk semua
 * User-Agent, supaya CDN tidak bisa menyajikan varian perangkat yang salah.
 */
"use strict";

const handler = require("../api/index.js");

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
  android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/126 Mobile",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126",
  linux: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126",
  kosong: "",
  telegram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Telegram-iOS/10.9",
  bot: "TelegramBot (like TwitterBot)",
};

function minta(jalur, ua) {
  const hasil = { status: 0, headers: {}, body: null };
  const res = {
    set statusCode(v) { hasil.status = v; },
    get statusCode() { return hasil.status; },
    setHeader(k, v) { hasil.headers[k.toLowerCase()] = v; },
    end(b) { hasil.body = b || null; },
  };
  handler({ url: jalur, headers: { "user-agent": ua } }, res);
  return hasil;
}

const SIMPAN = "minecraft://?addExternalServer=KONOHA%20Network|play.konohaserver.id:19132";
const SAMBUNG = "minecraft://connect?serverUrl=play.konohaserver.id&serverPort=19132";

console.log("=== Rute / identik untuk SEMUA perangkat (anti bocor cache) ===");
{
  const acuan = minta("/", UA.android);
  periksa("Android: 200 HTML", `${acuan.status} ${acuan.headers["content-type"]}`,
    "200 text/html; charset=utf-8");
  for (const nama of Object.keys(UA)) {
    const r = minta("/", UA[nama]);
    periksa(`${nama}: status sama`, r.status, acuan.status);
    periksa(`${nama}: tipe sama`, r.headers["content-type"], acuan.headers["content-type"]);
    periksa(`${nama}: isi byte-identik`, r.body === acuan.body, true);
  }
  periksa("tidak ada rute / yang mengirim octet-stream",
    Object.keys(UA).every((n) => minta("/", UA[n]).headers["content-type"] === "text/html; charset=utf-8"),
    true);
}

console.log();
console.log("=== Header anti-cache ===");
for (const jalur of ["/", "/go", "/go2", "/join", "/save", "/servers.dat", "/java", "/both"]) {
  const r = minta(jalur, UA.android);
  periksa(`${jalur}: no-store`, r.headers["cache-control"], "no-store, no-cache, must-revalidate");
  periksa(`${jalur}: Vary User-Agent`, r.headers["vary"], "User-Agent");
}

console.log();
console.log("=== Isi halaman rantai ===");
{
  const r = minta("/", UA.android);
  const b = r.body;
  periksa("skema simpan ada", b.includes(SIMPAN), true);
  periksa("skema sambung ada", b.includes(SAMBUNG), true);
  periksa("iframe dipakai", b.includes("<iframe"), true);
  periksa("iframe disembunyikan", b.includes("iframe{display:none}"), true);
  periksa("navigasi location.replace", b.includes("location.replace"), true);
  periksa("jeda default 700", b.includes("var JEDA    = 700"), true);
  periksa("cabang Java aktif di /", b.includes("var CABANG  = true"), true);
  periksa("deteksi di browser (navigator.userAgent)", b.includes("navigator.userAgent"), true);
  periksa("Java dialihkan ke /servers.dat", b.includes('location.replace("/servers.dat")'), true);
  periksa("iPad UA-desktop tertangani (maxTouchPoints)", b.includes("maxTouchPoints"), true);
  periksa("tanpa tombol", b.includes("<button"), false);
  periksa("tanpa tautan terlihat", b.includes("<a "), false);
  periksa("noindex", b.includes('name="robots" content="noindex"'), true);
  periksa("URI ditulis sebagai literal JSON", b.includes('"minecraft://'), true);
}
{
  const b = minta("/go", UA.android).body;
  periksa("/go: cabang Java dimatikan", b.includes("var CABANG  = false"), true);
  periksa("/go: simpan dulu", b.indexOf("PERTAMA = " + JSON.stringify(SIMPAN)) >= 0, true);
}
{
  const b = minta("/go2", UA.android).body;
  periksa("/go2: sambung dulu", b.indexOf("PERTAMA = " + JSON.stringify(SAMBUNG)) >= 0, true);
}
{
  periksa("?jeda=1500 dihormati", minta("/?jeda=1500", UA.android).body.includes("var JEDA    = 1500"), true);
  periksa("?jeda=99999 dibatasi 5000", minta("/?jeda=99999", UA.android).body.includes("var JEDA    = 5000"), true);
  periksa("?jeda=abc pakai default", minta("/?jeda=abc", UA.android).body.includes("var JEDA    = 700"), true);
}

console.log();
console.log("=== Rute tunggal ===");
periksa("/join -> 302 sambung", minta("/join", UA.android).headers.location, SAMBUNG);
periksa("/save -> 302 simpan", minta("/save", UA.iphone).headers.location, SIMPAN);
periksa("/both masih ada untuk rujukan", minta("/both", UA.android).status, 302);
periksa("jalur asing -> /", minta("/apa-saja", UA.android).headers.location, "/");
periksa("garis miring akhir", minta("/join/", UA.android).headers.location, SAMBUNG);

console.log();
console.log("=== servers.dat ===");
{
  const r = minta("/servers.dat", UA.linux);
  periksa("status 200", r.status, 200);
  periksa("tipe biner", r.headers["content-type"], "application/octet-stream");
  periksa("nama unduhan", r.headers["content-disposition"], 'attachment; filename="servers.dat"');
  periksa("88 byte", r.body.length, 88);
  periksa("NBT TAG_Compound", r.body[0], 10);
  periksa("NBT TAG_End", r.body[r.body.length - 1], 0);
  periksa("host benar", r.body.includes(Buffer.from("play.konohaserver.id")), true);
  periksa("tanpa host lama", r.body.includes(Buffer.from("konohanetwork")), false);
}
periksa("/java sama dengan /servers.dat",
  minta("/java", UA.linux).body.equals(minta("/servers.dat", UA.linux).body), true);

console.log();
console.log(gagal === 0 ? "SEMUA UJI LULUS" : `${gagal} UJI GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
