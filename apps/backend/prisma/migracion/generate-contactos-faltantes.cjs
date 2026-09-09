#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const RECORD_SIZE = 194;
const PAGE_SIZE = 512;
const RECORD_OFFSETS = [6, 232];
const EMPTY_DATE = -686688;
const EXPECTED_SEED_STUDENTS = 19_595;
const EXPECTED_EXCLUDED = 350;

function usage() {
  console.error(
    'Uso: node prisma/migracion/generate-contactos-faltantes.cjs <VERSION8/ARCHIVOS/CLI.DAT>',
  );
  process.exit(1);
}

function readString(buffer, offset, length) {
  return iconv
    .decode(buffer.subarray(offset, offset + length), 'cp850')
    .replaceAll('\0', '')
    .trim();
}

function isPrintable(buffer, start, end) {
  for (let index = start; index < end; index++) {
    if (buffer[index] !== 0 && buffer[index] < 32) return false;
  }
  return true;
}

function normalizeName(value) {
  let normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  let previous;
  do {
    previous = normalized;
    normalized = normalized
      .replace(/\s*(?:\/[A-Z0-9]+|\([^)]*\)|\[[^\]]*\]|A2)\s*$/, '')
      .trim();
  } while (normalized !== previous);

  return normalized.replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseDateNumber(value, type) {
  if (!value || value === EMPTY_DATE) return null;

  const z = Math.trunc(value + 2444239);
  let a;
  if (value < -145078) {
    a = z;
  } else {
    const century = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + century - Math.floor(century / 4);
  }
  const b = a + 1524;
  const c = Math.trunc((b - 122.1) / 365.25);
  const d = Math.trunc(365.25 * c);
  const e = Math.trunc((b - d) / 30.60001);
  const day = Math.floor(b - d - Math.trunc(30.60001 * e));
  const month = e > 13.5 ? Math.trunc(e - 13) : Math.trunc(e - 1);
  const rawYear = month > 2 ? Math.trunc(c - 4716) : Math.trunc(c - 4715);
  const shortYear = ((rawYear % 100) + 100) % 100;
  const year = shortYear <= 20 ? 2000 + shortYear : 1900 + shortYear;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (type === 'birth' && (year < 1920 || year > 2020)) return null;
  if (type === 'entry' && (year < 1990 || year > 2020)) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseCliDat(filePath) {
  const buffer = fs.readFileSync(filePath);
  const records = [];

  for (let page = 0; page < buffer.length; page += PAGE_SIZE) {
    for (const offset of RECORD_OFFSETS) {
      const start = page + offset;
      if (start + RECORD_SIZE > buffer.length) continue;

      const code = buffer.readUInt16LE(start);
      const rawName = readString(buffer, start + 2, 25);
      const validStrings =
        isPrintable(buffer, start + 2, start + 67) &&
        isPrintable(buffer, start + 70, start + 100) &&
        isPrintable(buffer, start + 105, start + 118) &&
        isPrintable(buffer, start + 134, start + 192);

      if (!code || !validStrings || !/^[A-ZÀ-ÖØ-Þ]/i.test(rawName) || !/[A-Z]{3}/i.test(rawName)) {
        continue;
      }

      const rawPhone = readString(buffer, start + 70, 15);
      const phone = (rawPhone.match(/\d/g) || []).length >= 4 ? rawPhone : null;
      records.push({
        code,
        rawName,
        key: normalizeName(rawName),
        telefono: phone,
        direccion: readString(buffer, start + 27, 25) || null,
        fechaNacimiento: parseDateNumber(buffer.readInt32LE(start + 125), 'birth'),
        fechaIngreso: parseDateNumber(buffer.readInt32LE(start + 130), 'entry'),
      });
    }
  }

  return { buffer, records };
}

function parseSeed(seedPath) {
  const source = fs.readFileSync(seedPath, 'utf8');
  const pattern = /\{ dni: '(\d+)', nombre: '((?:\\.|[^'])*)', apellido: '((?:\\.|[^'])*)', activo: true \}/g;
  const validName = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÇç\\' .-]+$/u;
  const students = [...source.matchAll(pattern)].map((match) => ({
    dni: match[1],
    nombre: match[2].replaceAll("\\'", "'"),
    apellido: match[3].replaceAll("\\'", "'"),
  }));
  const accepted = students.filter((student) =>
    validName.test(`${student.nombre} ${student.apellido}`),
  );

  if (students.length - accepted.length !== EXPECTED_EXCLUDED) {
    throw new Error(
      `Control fallido: se esperaban ${EXPECTED_EXCLUDED} excluidos y se encontraron ${students.length - accepted.length}`,
    );
  }
  if (accepted.length !== EXPECTED_SEED_STUDENTS) {
    throw new Error(
      `Control fallido: se esperaban ${EXPECTED_SEED_STUDENTS} alumnos y se encontraron ${accepted.length}`,
    );
  }

  return accepted.map((student) => ({
    ...student,
    key: normalizeName(`${student.apellido} ${student.nombre}`),
  }));
}

function indexByKey(items) {
  const index = new Map();
  for (const item of items) {
    const values = index.get(item.key) || [];
    values.push(item);
    index.set(item.key, values);
  }
  return index;
}

function main() {
  const cliDatPath = process.argv[2];
  if (!cliDatPath) usage();
  if (!fs.existsSync(cliDatPath)) throw new Error(`No existe: ${cliDatPath}`);

  const prismaDir = path.resolve(__dirname, '..');
  const seedPath = path.join(prismaDir, 'seed-faltantes.ts');
  const outputPath = path.join(prismaDir, 'contactos-faltantes.json');
  const students = parseSeed(seedPath);
  const { buffer, records } = parseCliDat(cliDatPath);
  const studentsByKey = indexByKey(students);
  const recordsByKey = indexByKey(records);

  const stats = {
    alumnosSeed: students.length,
    registrosFuente: records.length,
    coincidenciasSeguras: 0,
    nombresDuplicadosSeed: 0,
    nombresDuplicadosFuente: 0,
    sinCoincidencia: 0,
    conDatos: 0,
    telefono: 0,
    direccion: 0,
    fechaNacimiento: 0,
    fechaIngreso: 0,
    cuatroCampos: 0,
  };
  const contacts = [];

  for (const student of students) {
    const sameStudents = studentsByKey.get(student.key) || [];
    const sameRecords = recordsByKey.get(student.key) || [];
    if (sameStudents.length > 1) {
      stats.nombresDuplicadosSeed++;
      continue;
    }
    if (sameRecords.length > 1) {
      stats.nombresDuplicadosFuente++;
      continue;
    }
    if (sameRecords.length === 0) {
      stats.sinCoincidencia++;
      continue;
    }

    stats.coincidenciasSeguras++;
    const record = sameRecords[0];
    const fields = [
      record.telefono,
      record.direccion,
      record.fechaNacimiento,
      record.fechaIngreso,
    ];
    if (!fields.some(Boolean)) continue;

    stats.conDatos++;
    if (record.telefono) stats.telefono++;
    if (record.direccion) stats.direccion++;
    if (record.fechaNacimiento) stats.fechaNacimiento++;
    if (record.fechaIngreso) stats.fechaIngreso++;
    if (fields.every(Boolean)) stats.cuatroCampos++;
    contacts.push({
      dni: student.dni,
      nombre: student.nombre,
      apellido: student.apellido,
      telefono: record.telefono,
      direccion: record.direccion,
      fechaNacimiento: record.fechaNacimiento,
      fechaIngreso: record.fechaIngreso,
    });
  }

  const payload = {
    metadata: {
      version: 1,
      source: path.basename(cliDatPath),
      sourceSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      stats,
    },
    contacts,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, ...stats }, null, 2));
}

main();
