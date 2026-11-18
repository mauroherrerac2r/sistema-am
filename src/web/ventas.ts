// Ventas del CRM cruzadas con la inversión de Meta. Sin React ni Supabase: se prueba solo.
import { parseCsv, numero } from '../server/config-csv';
import type { Canal } from './reglas';

// ---------------- Lectura del export ----------------

export interface VentaAnuncio {
  ad_id: string;
  sede_crm: string | null;
  pre_leads: number;
  leads: number;
  ordenes: number;
  monto: number;
  por_cobrar: number;
  cobrado: number;
  enlaces: number;
}

/** Nombres de columna aceptados (sin tildes, minúsculas). El primero que aparezca gana. */
const COLUMNAS: Record<keyof Omit<VentaAnuncio, 'enlaces'>, string[]> = {
  ad_id: ['source_ad_id', 'id anuncio', 'id del anuncio', 'ad id', 'anuncio id', 'meta ad id'],
  sede_crm: ['product', 'producto', 'sede', 'oficina', 'sucursal'],
  pre_leads: ['pre-leads', 'pre leads', 'preleads'],
  leads: ['leads', 'lead'],
  ordenes: ['ordenes', 'orders', 'ventas', 'cantidad de ventas', 'pedidos'],
  monto: ['monto total', 'monto', 'total', 'revenue', 'importe', 'hot'],
  por_cobrar: ['por cobrar', 'pendiente'],
  cobrado: ['cobrado', 'pagado'],
};

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface LecturaVentas { filas: VentaAnuncio[]; leidas: number; descartadas: number; columnas: Partial<Record<keyof typeof COLUMNAS, string>> }

export function leerVentas(texto: string): LecturaVentas {
  const [enc, ...datos] = parseCsv(texto);
  if (!enc) throw new Error('El archivo está vacío.');
  const h = enc.map(normal);
  const idx = {} as Record<keyof typeof COLUMNAS, number>;
  const columnas: LecturaVentas['columnas'] = {};
  for (const [campo, nombres] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string[]][]) {
    idx[campo] = nombres.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
    if (idx[campo] >= 0) columnas[campo] = enc[idx[campo]];
  }
  if (idx.ad_id < 0) throw new Error('No encontré la columna con el ID del anuncio de Meta (por ejemplo "source_ad_id").');
  if (idx.leads < 0 && idx.ordenes < 0 && idx.monto < 0) throw new Error('No encontré columnas de leads, órdenes o monto.');

  const por = new Map<string, VentaAnuncio>();
  let descartadas = 0;
  for (const f of datos) {
    const id = (f[idx.ad_id] ?? '').trim().replace(/\.0+$/, '');
    if (!/^\d{6,25}$/.test(id)) { descartadas++; continue; }
    const v = (c: keyof typeof COLUMNAS) => (idx[c] >= 0 ? numero(f[idx[c]]) ?? 0 : 0);
    const t = por.get(id) ?? { ad_id: id, sede_crm: idx.sede_crm >= 0 ? (f[idx.sede_crm] || '').trim() || null : null, pre_leads: 0, leads: 0, ordenes: 0, monto: 0, por_cobrar: 0, cobrado: 0, enlaces: 0 };
    t.pre_leads += v('pre_leads'); t.leads += v('leads'); t.ordenes += v('ordenes');
    t.monto += v('monto'); t.por_cobrar += v('por_cobrar'); t.cobrado += v('cobrado'); t.enlaces++;
    por.set(id, t);
  }
  return { filas: [...por.values()], leidas: datos.length, descartadas, columnas };
}

// ---------------- Cruce con Meta ----------------

export interface AnuncioMeta {
  ad_id: string;
  ad_account_id: string;
  anuncio: string;
  campana: string;
  conjunto: string;
  estado: string | null;
  canal: Canal;
  inversion: number;
  resultados: number; // según canal
}

export interface Metricas {
  inversion: number;
  resultados_meta: number;
  leads_crm: number;
  ordenes: number;
  monto: number;
  cobrado: number;
  por_cobrar: number;
  roas: number | null;
  roas_cobrado: number | null;
  costo_orden: number | null;
  cierre_pct: number | null;
  cpl_crm: number | null;
  ticket: number | null;
}

export interface FilaCruce extends Metricas {
  ad_id: string;
  anuncio: string;
  campana: string;
  conjunto: string;
  ad_account_id: string | null;
  sede: string;
  canal: Canal | '–';
  estado: string | null;
  en_meta: boolean;
}

export interface Grupo extends Metricas { clave: string; anuncios: number }

const div = (a: number, b: number) => (b ? a / b : null);

function metricas(inv: number, resMeta: number, leads: number, ord: number, monto: number, cobrado: number, porCobrar: number): Metricas {
  return {
    inversion: inv, resultados_meta: resMeta, leads_crm: leads, ordenes: ord, monto, cobrado, por_cobrar: porCobrar,
    roas: inv ? monto / inv : null, roas_cobrado: inv ? cobrado / inv : null, costo_orden: inv ? div(inv, ord) : null,
    cierre_pct: leads ? (ord / leads) * 100 : null, cpl_crm: inv ? div(inv, leads) : null, ticket: div(monto, ord),
  };
}

/**
 * Une cada anuncio con gasto en Meta con sus ventas del CRM (por ID de anuncio).
 * Los anuncios del CRM sin gasto en el período quedan igual, con en_meta = false.
 */
export function cruzar(meta: AnuncioMeta[], ventas: VentaAnuncio[], sedeDeCuenta: (cuenta: string) => string): FilaCruce[] {
  const v = new Map(ventas.map((x) => [x.ad_id, x]));
  const filas: FilaCruce[] = meta.map((m) => {
    const x = v.get(m.ad_id);
    return {
      ad_id: m.ad_id, anuncio: m.anuncio, campana: m.campana, conjunto: m.conjunto, ad_account_id: m.ad_account_id,
      sede: sedeDeCuenta(m.ad_account_id), canal: m.canal, estado: m.estado, en_meta: true,
      ...metricas(m.inversion, m.resultados, x?.leads ?? 0, x?.ordenes ?? 0, x?.monto ?? 0, x?.cobrado ?? 0, x?.por_cobrar ?? 0),
    };
  });
  const enMeta = new Set(meta.map((m) => m.ad_id));
  for (const x of ventas) {
    if (enMeta.has(x.ad_id)) continue;
    filas.push({
      ad_id: x.ad_id, anuncio: `Anuncio ${x.ad_id}`, campana: '–', conjunto: '–', ad_account_id: null,
      sede: x.sede_crm ? `${x.sede_crm} · sin gasto en el período` : 'Sin gasto en el período', canal: '–', estado: null, en_meta: false,
      ...metricas(0, 0, x.leads, x.ordenes, x.monto, x.cobrado, x.por_cobrar),
    });
  }
  return filas.sort((a, b) => b.monto - a.monto || b.inversion - a.inversion);
}

export function agrupar(filas: FilaCruce[], clave: (f: FilaCruce) => string): Grupo[] {
  const g = new Map<string, FilaCruce[]>();
  filas.forEach((f) => g.set(clave(f), [...(g.get(clave(f)) || []), f]));
  return [...g.entries()].map(([k, fs]) => ({ clave: k, anuncios: fs.length, ...total(fs) })).sort((a, b) => b.inversion - a.inversion);
}

export function total(filas: FilaCruce[]): Metricas {
  const s = (k: keyof Metricas) => filas.reduce((t, f) => t + ((f[k] as number) || 0), 0);
  return metricas(s('inversion'), s('resultados_meta'), s('leads_crm'), s('ordenes'), s('monto'), s('cobrado'), s('por_cobrar'));
}

// ---------------- Hallazgos ----------------

export interface Hallazgo { tipo: 'bien' | 'aviso' | 'mal' | 'info'; texto: string }

/** Lecturas objetivas del cruce: se muestran en pantalla y alimentan el análisis con IA. */
export function hallazgos(filas: FilaCruce[], sedes: Grupo[], dinero: (v: number) => string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const t = total(filas);
  const pct = (v: number) => `${Math.round(v)}%`;
  const conVentas = filas.filter((f) => f.ordenes > 0);
  if (t.ordenes === 0) out.push({ tipo: 'mal', texto: 'El CRM no registra órdenes en el período: sin ventas cargadas no se puede medir el retorno.' });
  else {
    const montoTop = [...conVentas].sort((a, b) => b.monto - a.monto).slice(0, 3).reduce((s, f) => s + f.monto, 0);
    const conGasto = filas.filter((f) => f.inversion > 0);
    out.push({ tipo: 'info', texto: `${conGasto.filter((f) => f.ordenes > 0).length} de ${conGasto.length} anuncios con gasto en el período generaron ventas; los 3 anuncios que más vendieron explican el ${pct((montoTop / t.monto) * 100)} del monto.` });
  }
  for (const s of sedes) {
    if (s.leads_crm >= 30 && s.ordenes === 0) out.push({ tipo: 'aviso', texto: `${s.clave}: ${s.leads_crm} leads en el CRM y ninguna orden. Confirmar si la sede está cargando las ventas en el CRM.` });
  }
  const escalables = conVentas.filter((f) => f.inversion > 0 && f.roas != null && t.roas != null && f.roas >= t.roas * 1.3 && f.ordenes >= 2);
  for (const f of escalables.slice(0, 3)) out.push({ tipo: 'bien', texto: `${f.anuncio} (${f.sede}): ROAS ${f.roas!.toFixed(2)} con ${f.ordenes} órdenes y cierre del ${(f.cierre_pct ?? 0).toFixed(1)}%. Candidato a escalar.` });
  if (t.costo_orden != null) {
    const caros = filas.filter((f) => f.ordenes === 0 && f.inversion >= t.costo_orden! * 1.5).sort((a, b) => b.inversion - a.inversion);
    if (caros.length) out.push({ tipo: 'mal', texto: `${caros.length} ${caros.length === 1 ? 'anuncio gastó' : 'anuncios gastaron'} más de 1,5 veces el costo por orden promedio (${dinero(t.costo_orden)}) sin vender: ${caros.slice(0, 3).map((f) => f.anuncio).join(', ')}.` });
  }
  const fuera = filas.filter((f) => !f.en_meta && f.leads_crm > 0);
  if (fuera.length) out.push({ tipo: 'info', texto: `${fuera.length} anuncios del CRM no tuvieron gasto en las cuentas cargadas en el período (pueden ser de otra cuenta o de antes): suman ${fuera.reduce((s, f) => s + f.leads_crm, 0)} leads y ${fuera.reduce((s, f) => s + f.ordenes, 0)} órdenes.` });
  if (t.resultados_meta && t.leads_crm) {
    const r = t.leads_crm / t.resultados_meta;
    if (r < 0.6) out.push({ tipo: 'aviso', texto: `El CRM registra ${pct(r * 100)} de los resultados que informa Meta (${t.leads_crm} contra ${t.resultados_meta}). Revisar que todas las conversaciones lleguen al CRM con su anuncio.` });
    else if (r > 1.4) out.push({ tipo: 'info', texto: `El CRM registra más leads que Meta (${t.leads_crm} contra ${t.resultados_meta}): hay leads atribuidos a anuncios que Meta no cuenta como resultado.` });
  }
  if (t.monto && t.cobrado === 0) out.push({ tipo: 'aviso', texto: `Todo el monto vendido (${dinero(t.monto)}) figura por cobrar: el ROAS cobrado hoy es 0.` });
  return out;
}
