// Lee el CSV exportado del Sheet "Configuración de clientes · Panel AM".
// Columnas: Cliente, Sede, Cuenta publicitaria, ID cuenta publicitaria, Activa, Moneda,
// Presupuesto mensual, Presupuesto semanal, CPL objetivo, CPL máximo tolerable,
// Canal publicitario, Notas y, opcional, AM (email del Account Manager).

/** Separador según la primera línea: tab (pegado desde Sheets/Excel), punto y coma (Excel en español) o coma. */
export function separador(texto: string): string {
  const primera = texto.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  if (cuenta('\t') > 0) return '\t';
  return cuenta(';') > cuenta(',') ? ';' : ',';
}

export function parseCsv(texto: string, sep = separador(texto)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

/** Acepta 1.234,56 · 1234.56 · $ 1.500 · 1500 */
export function numero(v: unknown): number | null {
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function canales(s: string): string[] {
  const t = s.toLowerCase();
  const out: string[] = [];
  if (/formulario|lead/.test(t)) out.push('Formulario');
  if (/whats/.test(t)) out.push('WhatsApp');
  if (/messenger/.test(t)) out.push('Messenger');
  if (/instagram|direct/.test(t)) out.push('Instagram');
  return out;
}

/** "No", "-", "N/A" o vacío = sin sede. */
export const sinValor = (s: string) => /^(|no|-|–|n\/a|na|ninguna)$/i.test(s.trim());

export interface FilaConfig {
  cliente: string; slug: string; sede: string | null; cuenta: string; ad_account_id: string;
  activa: boolean; moneda: string | null; presupuesto_mensual: number | null; presupuesto_semanal: number | null;
  cpl_objetivo: number | null; cpl_maximo: number | null; canales: string[]; nota: string | null; am_email: string | null;
}

export function leerConfig(texto: string): FilaConfig[] {
  const [enc, ...datos] = parseCsv(texto);
  if (!enc) return [];
  const col = (n: string) => enc.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase());
  const c = {
    cliente: col('Cliente'), sede: col('Sede'), cuenta: col('Cuenta publicitaria'), id: col('ID cuenta publicitaria'),
    activa: col('Activa'), moneda: col('Moneda'), pm: col('Presupuesto mensual'), ps: col('Presupuesto semanal'),
    obj: col('CPL objetivo'), max: col('CPL máximo tolerable'), canal: col('Canal publicitario'), nota: col('Notas'), am: col('AM'),
  };
  if (c.cliente < 0 || c.id < 0) throw new Error('El CSV necesita al menos las columnas "Cliente" e "ID cuenta publicitaria"');
  const v = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '').trim() : '');
  return datos.filter((f) => v(f, c.cliente) && v(f, c.id)).map((f) => {
    const ps = numero(v(f, c.ps)), pm = numero(v(f, c.pm));
    return {
      cliente: v(f, c.cliente), slug: slug(v(f, c.cliente)), sede: sinValor(v(f, c.sede)) ? null : v(f, c.sede), cuenta: v(f, c.cuenta),
      ad_account_id: v(f, c.id).replace(/^act_/, ''), activa: v(f, c.activa).toLowerCase().startsWith('s'),
      moneda: v(f, c.moneda) || null, presupuesto_mensual: pm,
      presupuesto_semanal: ps ?? (pm != null ? Math.round((pm / 30.4) * 7 * 100) / 100 : null),
      cpl_objetivo: numero(v(f, c.obj)), cpl_maximo: numero(v(f, c.max)), canales: canales(v(f, c.canal)),
      nota: v(f, c.nota) || null, am_email: v(f, c.am).toLowerCase() || null,
    };
  });
}
