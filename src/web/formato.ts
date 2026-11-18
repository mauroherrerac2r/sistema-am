const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const prefijo = (m?: string | null) => (m === 'MXN' ? 'MX$' : m === 'USD' ? 'US$' : m === 'ARS' ? 'AR$' : m === 'EUR' ? '€' : '$');
export const dinero = (v: number | null | undefined, m?: string | null) => (v == null ? '–' : prefijo(m) + nf2.format(v));
export const dinero0 = (v: number | null | undefined, m?: string | null) => (v == null ? '–' : prefijo(m) + nf0.format(v));
export const entero = (v: number | null | undefined) => (v == null ? '–' : nf0.format(v));
export const dec = (v: number | null | undefined, d = 2) => (v == null ? '–' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v: number | null | undefined, d = 0) => (v == null ? '–' : v.toLocaleString('es-AR', { maximumFractionDigits: d }) + '%');
export const pctSigno = (v: number | null | undefined) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf0.format(Math.abs(v)) + '%');
export const hhmm = (h: number | null) => (h == null ? '–' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; };
export const haceMin = (iso?: string | null) => {
  if (!iso) return 'nunca';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};
