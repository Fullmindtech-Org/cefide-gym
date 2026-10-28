export function periodoActualArgentina(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
  }).formatToParts(ahora);
  return partes.find((p) => p.type === 'year')!.value + '-' +
    partes.find((p) => p.type === 'month')!.value;
}

export function formatoPeriodoArgentina(periodo: string) {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(periodo + '-01T12:00:00-03:00'))
    .replace(/^./, (letter) => letter.toUpperCase());
}
