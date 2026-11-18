// Fechas como texto YYYY-MM-DD, siempre en la zona horaria de la cuenta publicitaria.

export function fechaEnZona(zona: string | null | undefined, dias = 0, ahora = new Date()): string {
  const d = new Date(ahora.getTime() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Hora decimal (0–24) en la zona de la cuenta. */
export function horaEnZona(zona: string | null | undefined, ahora = new Date()): number | null {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ahora);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return g('hour') + g('minute') / 60;
  } catch {
    return null;
  }
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(fecha + 'T00:00:00Z') + dias * 86_400_000).toISOString().slice(0, 10);
}
