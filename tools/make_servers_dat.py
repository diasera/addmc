#!/usr/bin/env python3
"""Generator servers.dat (NBT tak terkompresi) untuk Minecraft Java Edition.
Dipakai supaya pemain Java tinggal unduh 1 file, taruh di .minecraft, server langsung ada di daftar.
"""
import struct, sys, os

def tag_string(s: bytes) -> bytes:
    return struct.pack('>H', len(s)) + s

def build_servers_dat(servers):
    """servers: list of (nama, 'host:port') -> bytes NBT uncompressed."""
    out = bytearray()
    # root: TAG_Compound, name ""
    out += b'\x0a' + tag_string(b'')
    # field: TAG_List (id 9) named "servers"
    out += b'\x09' + tag_string(b'servers')
    # list of TAG_Compound (id 10), jumlah entri
    out += b'\x0a' + struct.pack('>i', len(servers))
    for nama, ip in servers:
        # TAG_String "ip"
        out += b'\x08' + tag_string(b'ip') + tag_string(ip.encode('utf-8'))
        # TAG_String "name"
        out += b'\x08' + tag_string(b'name') + tag_string(nama.encode('utf-8'))
        # TAG_Byte "acceptTextures" = 1  (auto-terima resource pack, server pakai force-resource-packs)
        out += b'\x01' + tag_string(b'acceptTextures') + b'\x01'
        # TAG_End penutup compound entri
        out += b'\x00'
    # TAG_End penutup root
    out += b'\x00'
    return bytes(out)


def parse_check(data):
    """Verifikasi mandiri: baca ulang NBT yang baru dibuat."""
    p = 0
    assert data[p] == 0x0a, 'root bukan TAG_Compound'
    p += 1
    ln = struct.unpack_from('>H', data, p)[0]; p += 2 + ln
    assert data[p] == 0x09, 'field bukan TAG_List'
    p += 1
    ln = struct.unpack_from('>H', data, p)[0]; p += 2
    assert data[p:p+ln] == b'servers', 'nama field salah'
    p += ln
    assert data[p] == 0x0a, 'isi list bukan TAG_Compound'
    p += 1
    n = struct.unpack_from('>i', data, p)[0]; p += 4
    hasil = []
    for _ in range(n):
        entri = {}
        while data[p] != 0x00:
            t = data[p]; p += 1
            ln = struct.unpack_from('>H', data, p)[0]; p += 2
            key = data[p:p+ln].decode(); p += ln
            if t == 0x08:
                ln2 = struct.unpack_from('>H', data, p)[0]; p += 2
                entri[key] = data[p:p+ln2].decode(); p += ln2
            elif t == 0x01:
                entri[key] = data[p]; p += 1
            else:
                raise AssertionError(f'tag tak terduga {t}')
        p += 1
        hasil.append(entri)
    assert data[p] == 0x00, 'root tak ditutup TAG_End'
    return hasil


if __name__ == '__main__':
    SERVERS = [('KONOHA Network', 'play.konohaserver.id')]
    blob = build_servers_dat(SERVERS)
    dest = sys.argv[1] if len(sys.argv) > 1 else '/root/konoha-add/public/servers.dat'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as f:
        f.write(blob)
    isi = parse_check(blob)
    print(f'servers.dat dibuat: {dest} ({len(blob)} byte)')
    print('verifikasi baca ulang:', isi)
