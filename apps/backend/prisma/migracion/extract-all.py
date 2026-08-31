#!/usr/bin/env python3
"""
extract-all.py — Extrae clientes de VERSION8/CLI.ASC + SISTEMA/CLI.DAT
y genera docs/alumnos_version8.csv actualizado.

Uso: python extract-all.py
"""

import struct
import re
import csv
import os

# Rutas
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SCRIPT_DIR, '..', '..', '..', '..')
VERSION8_ASC = r"C:\Users\Jerem\Downloads\VERSION8\VERSION8\ARCHIVOS\CLI.ASC"
SISTEMA_DAT  = r"C:\Users\Jerem\Downloads\SISTEMA\SISTEMA\ARCHIVOS\CLI.DAT"
OUTPUT_CSV   = r"C:\Users\Jerem\Desktop\fullmintech\cefide-gym\docs\alumnos_version8.csv"

# ── Estructura TipoCli (194 bytes) ────────────────────────────────────────────
RECORD_SIZE = 194
PREFIX_ASC  = b'194,'

FIELDS = {
    'COD':        (0,   2,  'uint16'),
    'NOMBRE':     (2,   25, 'str'),
    'DOMICILIO':  (27,  25, 'str'),
    'BARRIO':     (52,  15, 'str'),
    'CODPOS':     (67,  2,  'uint16'),
    'CODPCIA':    (69,  1,  'str'),
    'TEL':        (70,  15, 'str'),
    'LOCA':       (85,  15, 'str'),
    'IVA':        (100, 1,  'str'),
    'CREDITO':    (101, 4,  'float32'),
    'CUIT':       (105, 13, 'str'),
    'VENDEDOR':   (118, 1,  'str'),
    'REPARTO':    (119, 1,  'str'),
    'LISTA':      (120, 1,  'str'),
    'SALDO':      (121, 4,  'float32'),
    'FECHNAC':    (125, 4,  'int32'),
    'SEXO':       (129, 1,  'str'),
    'FECHING':    (130, 4,  'int32'),
    'DEPORTE':    (134, 30, 'str'),
    'ACTIVIDAD':  (164, 30, 'str'),
}

JUNK_NAMES = {
    'VENTA DE MOSTRADOR', 'CLUB BELGRANO', 'CLUB ATLETICO', 'PRUEBA',
    'TEST', 'FACTURA', 'RRRRR', 'XXXXX', 'AAAAA', 'CEFIDE', 'ENTE',
    'MOSTR', 'MOSTRADOR', 'VISTA', 'CONTADO',
}

ACTIVIDAD_MAP = {
    'APARATOS': 'APARATOS', 'APARTOS': 'APARATOS', 'APARATO': 'APARATOS',
    'APARARTOS': 'APARATOS', 'APAARTOS': 'APARATOS', 'APPARATOS': 'APARATOS',
    'APRATOS': 'APARATOS', 'PARATOS': 'APARATOS', 'APARTO': 'APARATOS',
    'GIMNASIO': 'GIMNASIO', 'GIMNAISO': 'GIMNASIO', 'GIMASIO': 'GIMNASIO',
    'AERO': 'AERO', 'AERO2': 'AERO', 'AEROBIC': 'AERO', 'AEROBICS': 'AERO',
    'AEROBICA': 'AERO', 'AEROBICAS': 'AERO', 'AERO ZUMBA': 'AERO',
    'SPINNING': 'SPINNING', 'SPINING': 'SPINNING',
    'YOGA': 'YOGA',
    'ESCALADA': 'ESCALADA', 'ESCALADA KIDS': 'ESCALADA',
    'BOXEO': 'BOXEO', 'BOX': 'BOXEO',
    'CROSS TRAINING': 'CROSS TRAINING', 'CROSS TRAINNING': 'CROSS TRAINING',
    'CROSS FIT': 'CROSS TRAINING', 'CROSS': 'CROSS TRAINING',
    'PILATES': 'PILATES', 'PILATES REFORMER': 'PILATES',
    'FUNCIONAL': 'FUNCIONAL',
    'ZUMBA': 'ZUMBA',
    'KINESIOLOGIA': 'KINESIOLOGIA',
    'REHABILITACION': 'REHABILITACION',
    'PERSONAL TRAINER': 'PERSONAL TRAINER',
    'NATACION': 'NATACION',
    'RUGBY': 'RUGBY',
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def read_str(data: bytes, offset: int, length: int) -> str:
    raw = data[offset:offset+length]
    return raw.decode('cp850', errors='replace').replace('\x00', '').strip()

def read_uint16(data: bytes, offset: int) -> int:
    return struct.unpack_from('<H', data, offset)[0]

def read_int32(data: bytes, offset: int) -> int:
    return struct.unpack_from('<i', data, offset)[0]

def parse_record(data: bytes) -> dict:
    r = {}
    for name, (off, length, ftype) in FIELDS.items():
        if off + length > len(data):
            r[name] = '' if ftype == 'str' else 0
            continue
        if ftype == 'str':
            r[name] = read_str(data, off, length)
        elif ftype == 'uint16':
            r[name] = read_uint16(data, off)
        elif ftype == 'int32':
            r[name] = read_int32(data, off)
        elif ftype == 'float32':
            r[name] = struct.unpack_from('<f', data, off)[0]
    return r

def is_valid_record(data: bytes) -> bool:
    if len(data) < RECORD_SIZE:
        return False

    cod = read_uint16(data, 0)
    if cod == 0 or cod > 99999:
        return False

    # NOMBRE: at least 3 uppercase ASCII letters
    nombre_bytes = data[2:27]
    letters = sum(1 for b in nombre_bytes if 65 <= b <= 90)  # A-Z
    if letters < 3:
        return False

    # NOMBRE should be mostly printable
    non_print = sum(1 for b in nombre_bytes if b < 32 and b != 0)
    if non_print > 3:
        return False

    return True

def is_junk(nombre: str) -> bool:
    up = nombre.upper().strip()
    for junk in JUNK_NAMES:
        if junk in up:
            return True
    # Only numbers/symbols
    if not any(c.isalpha() for c in nombre):
        return True
    return False

def extract_dni(cuit: str) -> str:
    nums = re.sub(r'[^0-9]', '', cuit)
    if 7 <= len(nums) <= 8:
        return nums
    if len(nums) == 11:
        return nums[2:10]
    return ''

PREPOSITIONS = {'DE', 'DEL', 'DI', 'LA', 'LAS', 'LOS', 'DA', 'DOS', 'VAN', 'VON'}

def split_nombre(raw: str):
    """'APELLIDO NOMBRE /A2' → (apellido, nombre, nombre_completo)"""
    clean = re.sub(r'\s*/[A-Z0-9]+\s*$', '', raw)
    clean = re.sub(r'\([^)]*\)\s*$', '', clean).strip()

    parts = clean.split()
    if not parts:
        return '', '', clean.title()

    ap_n = 1
    if parts[0].upper() in PREPOSITIONS and len(parts) > 1:
        ap_n = 2
        if len(parts) > 2 and parts[1].upper() in PREPOSITIONS:
            ap_n = 3
    if ap_n >= len(parts):
        ap_n = max(1, len(parts) - 1)

    apellido = ' '.join(parts[:ap_n]).title()
    nombre   = ' '.join(parts[ap_n:]).title()
    nombre_completo = clean.title()
    return apellido, nombre, nombre_completo

def normalize_act(s: str) -> str:
    if not s:
        return ''
    up = s.strip().upper()
    if up in ACTIVIDAD_MAP:
        return ACTIVIDAD_MAP[up]
    for k, v in ACTIVIDAD_MAP.items():
        if up.startswith(k[:5]) or k in up:
            return v
    if re.match(r'^APARA?T', up):    return 'APARATOS'
    if re.match(r'^GIM',     up):    return 'GIMNASIO'
    if re.match(r'^AERO',    up):    return 'AERO'
    if re.match(r'^SPIN',    up):    return 'SPINNING'
    if re.match(r'^ESCAL',   up):    return 'ESCALADA'
    if re.match(r'^BOX',     up):    return 'BOXEO'
    if re.match(r'^CROSS',   up):    return 'CROSS TRAINING'
    if re.match(r'^PILAT',   up):    return 'PILATES'
    if re.match(r'^FUNC',    up):    return 'FUNCIONAL'
    if re.match(r'^YOGA',    up):    return 'YOGA'
    if re.match(r'^ZUMBA',   up):    return 'ZUMBA'
    if re.match(r'^KINESIO', up):    return 'KINESIOLOGIA'
    if re.match(r'^REHAB',   up):    return 'REHABILITACION'
    return ''  # external sport or irrelevant

def record_to_row(rec: dict) -> dict | None:
    nombre_raw = rec.get('NOMBRE', '')
    if not nombre_raw or len(nombre_raw) < 2:
        return None
    if is_junk(nombre_raw):
        return None

    apellido, nombre, nombre_completo = split_nombre(nombre_raw)
    if not apellido:
        return None

    dni = extract_dni(rec.get('CUIT', ''))

    codpcia = rec.get('CODPCIA', '').strip()
    tel     = rec.get('TEL', '').strip()
    # In old system: full phone = CODPCIA + TEL (e.g. 'B' + '422004' = 'B422004')
    telefono = (codpcia + tel).strip() if (codpcia or tel) else ''
    # Strip leading junk (non-alphanumeric)
    telefono = re.sub(r'^[^0-9A-Za-z]+', '', telefono)

    domicilio = rec.get('DOMICILIO', '').strip()
    barrio    = rec.get('BARRIO', '').strip()
    direccion = f"{domicilio} {barrio}".strip() if barrio else domicilio

    ciudad = rec.get('LOCA', '').strip()

    act1 = normalize_act(rec.get('ACTIVIDAD', ''))
    act2 = normalize_act(rec.get('DEPORTE', ''))
    actividad = act1 or act2

    return {
        'apellido':       apellido,
        'nombre':         nombre,
        'nombre_completo': nombre_completo,
        'dni':            dni,
        'telefono':       telefono,
        'ciudad':         ciudad,
        'direccion':      direccion,
        'actividad':      actividad,
        'club':           actividad,
        '_cod':           rec.get('COD', 0),
    }

# ── Readers ───────────────────────────────────────────────────────────────────

def read_asc(path: str) -> list[dict]:
    """CLI.ASC: busca '194,' y lee 194 bytes de datos."""
    records = []
    with open(path, 'rb') as f:
        data = f.read()

    pos = 0
    while pos < len(data) - 4:
        if data[pos:pos+4] == PREFIX_ASC:
            start = pos + 4
            if start + RECORD_SIZE <= len(data):
                chunk = data[start:start+RECORD_SIZE]
                if is_valid_record(chunk):
                    records.append(parse_record(chunk))
            pos = start + RECORD_SIZE
        else:
            pos += 1

    return records

def read_dat_binary(path: str) -> list[dict]:
    """CLI.DAT binario Btrieve: scan heurístico por registros válidos."""
    records = []
    seen_cods: set[int] = set()

    with open(path, 'rb') as f:
        data = f.read()

    pos = 0
    step = 1
    while pos <= len(data) - RECORD_SIZE:
        chunk = data[pos:pos+RECORD_SIZE]
        if is_valid_record(chunk):
            rec = parse_record(chunk)
            cod = rec.get('COD', 0)
            if cod and cod not in seen_cods:
                seen_cods.add(cod)
                records.append(rec)
            # Jump ahead by record size to avoid re-detecting same record
            pos += RECORD_SIZE
        else:
            pos += step

    return records

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Extractor cefide-gym: VERSION8 + SISTEMA -> CSV")
    print("=" * 60)

    # 1. Leer VERSION8 CLI.ASC
    print(f"\n[1/3] Leyendo VERSION8 CLI.ASC ...")
    asc_recs = read_asc(VERSION8_ASC)
    print(f"      {len(asc_recs)} registros encontrados")

    # 2. Leer SISTEMA CLI.DAT (binario)
    print(f"\n[2/3] Leyendo SISTEMA CLI.DAT (binario) ...")
    dat_recs = read_dat_binary(SISTEMA_DAT)
    print(f"      {len(dat_recs)} registros encontrados")

    # 3. Convertir a filas CSV
    asc_rows = [r for rec in asc_recs if (r := record_to_row(rec)) is not None]
    dat_rows = [r for rec in dat_recs if (r := record_to_row(rec)) is not None]
    print(f"\n      VERSION8 filas válidas: {len(asc_rows)}")
    print(f"      SISTEMA  filas válidas: {len(dat_rows)}")

    # 4. Fusionar: clave = nombre_completo uppercase
    #    SISTEMA tiene prioridad (datos más recientes)
    merged: dict[str, dict] = {}
    for row in asc_rows:
        key = row['nombre_completo'].upper().strip()
        if key:
            merged[key] = row

    for row in dat_rows:
        key = row['nombre_completo'].upper().strip()
        if key:
            merged[key] = row  # sobreescribe con datos de SISTEMA

    all_rows = sorted(
        merged.values(),
        key=lambda r: (r['apellido'].lower(), r['nombre'].lower(), r['_cod'])
    )
    print(f"\n      Total único: {len(all_rows)} alumnos")

    # 5. Escribir CSV
    out_path = os.path.normpath(OUTPUT_CSV)
    print(f"\n[3/3] Escribiendo {out_path} ...")
    fieldnames = ['apellido', 'nombre', 'nombre_completo', 'dni',
                  'telefono', 'ciudad', 'direccion', 'actividad', 'club']

    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"      Listo. {len(all_rows)} filas escritas.")

    # 6. Estadísticas
    with_dni = sum(1 for r in all_rows if r['dni'])
    act_count: dict[str, int] = {}
    for r in all_rows:
        act = r['actividad'] or '(sin actividad)'
        act_count[act] = act_count.get(act, 0) + 1

    print(f"\n  Con DNI:       {with_dni}")
    print(f"  Sin DNI:       {len(all_rows) - with_dni}")
    print(f"\n  Actividades detectadas:")
    for act, n in sorted(act_count.items(), key=lambda x: -x[1])[:15]:
        print(f"    {n:5}  {act}")

    print("\n" + "=" * 60)
    print(f"  Archivo generado: docs/alumnos_version8.csv")
    print("=" * 60)

if __name__ == '__main__':
    main()
