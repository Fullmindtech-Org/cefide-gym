#!/usr/bin/env python3
"""
gen-seed-prod.py — Regenera seed-prod.ts con todos los alumnos del CSV que tienen DNI.
Uso: python gen-seed-prod.py
"""

import csv
import os
import re

CSV_PATH  = r"C:\Users\Jerem\Desktop\fullmintech\cefide-gym\docs\alumnos_version8.csv"
SEED_PATH = r"C:\Users\Jerem\Desktop\fullmintech\cefide-gym\apps\backend\prisma\seed-prod.ts"

# Actividades validas del gimnasio (externals como RUGBY/NATACION se omiten de insc.)
CEFIDE_ACTS = {
    'AERO', 'APARATOS', 'GIMNASIO', 'ESCALADA', 'CROSS TRAINING',
    'PILATES', 'SPINNING', 'YOGA', 'BOXEO', 'ZUMBA',
    'KINESIOLOGIA', 'REHABILITACION', 'FUNCIONAL', 'PERSONAL TRAINER',
}

def esc(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")

def main():
    rows = []
    seen_dni = set()

    with open(CSV_PATH, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            dni = row.get('dni', '').strip()
            if not dni:
                continue
            if dni in seen_dni:
                continue
            seen_dni.add(dni)

            nombre   = row.get('nombre', '').strip()
            apellido = row.get('apellido', '').strip()
            actividad = row.get('actividad', '').strip().upper()

            if not nombre and not apellido:
                continue

            rows.append({
                'dni':      dni,
                'nombre':   nombre,
                'apellido': apellido,
                'actividad': actividad if actividad in CEFIDE_ACTS else '',
            })

    print(f"Alumnos con DNI: {len(rows)}")

    # Actividades unicas presentes en el CSV
    actividades = sorted({r['actividad'] for r in rows if r['actividad']})
    # Agregar General siempre
    if 'General' not in actividades:
        actividades.append('General')
    actividades = sorted(actividades)

    print(f"Actividades: {actividades}")

    # Leer seed-prod.ts actual
    with open(SEED_PATH, encoding='utf-8') as f:
        original = f.read()

    # Generar bloque ACTIVIDADES
    act_lines = ',\n'.join(f"  '{a}'" for a in actividades)
    actividades_block = f"const ACTIVIDADES = [\n{act_lines},\n];"

    # Generar bloque ALUMNOS
    alumno_lines = []
    for r in rows:
        line = f"  {{ dni: '{esc(r['dni'])}', nombre: '{esc(r['nombre'])}', apellido: '{esc(r['apellido'])}', activo: true }},"
        alumno_lines.append(line)
    alumnos_block = (
        "const ALUMNOS: { dni: string; nombre: string; apellido: string; activo: boolean }[] = [\n"
        + '\n'.join(alumno_lines)
        + '\n];'
    )

    # Generar bloque INSCRIPCIONES (solo alumnos con actividad CEFIDE)
    insc_lines = []
    for r in rows:
        if not r['actividad']:
            continue
        line = f"  {{ dniAlumno: '{esc(r['dni'])}', actividad: '{esc(r['actividad'])}', frecuencia: Frecuencia.UNA_VEZ }},"
        insc_lines.append(line)
    insc_block = (
        "const INSCRIPCIONES: { dniAlumno: string; actividad: string; frecuencia: Frecuencia }[] = [\n"
        + '\n'.join(insc_lines)
        + '\n];'
    )

    print(f"Inscripciones (con actividad): {len(insc_lines)}")

    # Reemplazar bloques en seed-prod.ts usando marcadores de inicio/fin
    def replace_block(content, pattern_start, new_block):
        """Reemplaza desde pattern_start hasta el primer '];' que cierra el bloque."""
        idx = content.find(pattern_start)
        if idx == -1:
            raise ValueError(f"No encontrado: {pattern_start!r}")
        # Buscar el cierre '];' desde idx
        end = content.find('];', idx)
        if end == -1:
            raise ValueError(f"No se encontro cierre para: {pattern_start!r}")
        end += 2  # incluir '];'
        return content[:idx] + new_block + content[end:]

    updated = original
    updated = replace_block(updated, 'const ACTIVIDADES = [', actividades_block)
    updated = replace_block(updated, 'const ALUMNOS:', alumnos_block)
    updated = replace_block(updated, 'const INSCRIPCIONES:', insc_block)

    with open(SEED_PATH, 'w', encoding='utf-8') as f:
        f.write(updated)

    print(f"\nSeed actualizado: {SEED_PATH}")
    print(f"  {len(rows)} alumnos")
    print(f"  {len(insc_lines)} inscripciones")
    print(f"  {len(actividades)} actividades: {actividades}")

if __name__ == '__main__':
    main()
