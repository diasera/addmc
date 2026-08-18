#!/usr/bin/env python3
"""Buat servers.dat (NBT tak terkompresi) untuk Minecraft Java Edition.

Pemain Java menaruh file ini di folder .minecraft supaya server langsung
muncul di daftar Multiplayer. Minecraft Java tidak punya skema URI, jadi ini
satu-satunya jalan yang jujur untuk mereka.

Struktur NBT:
  TAG_Compound ""
    TAG_List "servers"
      TAG_Compound
        TAG_String "ip"
        TAG_String "name"
        TAG_Byte   "acceptTextures"
"""

import base64
import pathlib
import struct

NAMA = "KONOHA Network"
HOST = "play.konohaserver.id"

TAG_END = 0
TAG_BYTE = 1
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10


def nama_tag(teks: str) -> bytes:
    b = teks.encode("utf-8")
    return struct.pack(">H", len(b)) + b


def tag_string(kunci: str, nilai: str) -> bytes:
    b = nilai.encode("utf-8")
    return bytes([TAG_STRING]) + nama_tag(kunci) + struct.pack(">H", len(b)) + b


def tag_byte(kunci: str, nilai: int) -> bytes:
    return bytes([TAG_BYTE]) + nama_tag(kunci) + bytes([nilai & 0xFF])


def bangun(nama: str, host: str) -> bytes:
    isi = tag_string("ip", host) + tag_string("name", nama) + tag_byte("acceptTextures", 1)
    entri = isi + bytes([TAG_END])
    daftar = bytes([TAG_LIST]) + nama_tag("servers") + bytes([TAG_COMPOUND]) + struct.pack(">i", 1) + entri
    return bytes([TAG_COMPOUND]) + nama_tag("") + daftar + bytes([TAG_END])


def periksa(data: bytes) -> dict:
    """Parser mandiri: baca ulang hasilnya supaya tidak percaya penulisnya sendiri."""
    p = 0

    def ambil(n):
        nonlocal p
        potong = data[p : p + n]
        p += n
        return potong

    def baca_nama():
        (panjang,) = struct.unpack(">H", ambil(2))
        return ambil(panjang).decode("utf-8")

    assert ambil(1)[0] == TAG_COMPOUND, "root bukan TAG_Compound"
    baca_nama()
    assert ambil(1)[0] == TAG_LIST, "field pertama bukan TAG_List"
    assert baca_nama() == "servers", "nama list bukan 'servers'"
    assert ambil(1)[0] == TAG_COMPOUND, "isi list bukan TAG_Compound"
    (jumlah,) = struct.unpack(">i", ambil(4))
    assert jumlah == 1, f"jumlah server {jumlah}, harusnya 1"

    hasil = {}
    while True:
        jenis = ambil(1)[0]
        if jenis == TAG_END:
            break
        kunci = baca_nama()
        if jenis == TAG_STRING:
            (panjang,) = struct.unpack(">H", ambil(2))
            hasil[kunci] = ambil(panjang).decode("utf-8")
        elif jenis == TAG_BYTE:
            hasil[kunci] = ambil(1)[0]
        else:
            raise AssertionError(f"jenis tag tak terduga: {jenis}")

    assert data[p] == TAG_END, "root tidak diakhiri TAG_End"
    return hasil


if __name__ == "__main__":
    data = bangun(NAMA, HOST)
    isi = periksa(data)
    assert isi["ip"] == HOST, isi
    assert isi["name"] == NAMA, isi

    tujuan = pathlib.Path(__file__).resolve().parent.parent / "public" / "servers.dat"
    tujuan.parent.mkdir(parents=True, exist_ok=True)
    tujuan.write_bytes(data)

    print(f"tulis  : {tujuan}")
    print(f"ukuran : {len(data)} byte")
    print(f"isi    : {isi}")
    print(f"base64 : {base64.b64encode(data).decode()}")
