// Lectura de datos desde Supabase (respetando los permisos de cada usuario).
import { supabase } from './supabase';
import type { CfgCuenta, CuentaMeta, Dia, FilaAnuncioCruda } from './reglas';
import { canalAnuncio } from './reglas';
import type { VentaAnuncio } from './ventas';

export interface Perfil { id: string; email: string; nombre: string | null; rol: 'admin' | 'am' | 'pm' }
export interface Cliente { id: string; slug: string; nombre: string; am_id: string | null; activo: boolean; contexto_ia: string | null; roas_objetivo: number | null }

/** Supabase devuelve como máximo 1000 filas por pedido: se pagina. */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const num = (v: unknown) => (v == null ? null : Number(v));

export async function cargarConfig() {
  const [perfiles, clientes, cfg, cuentas] = await Promise.all([
    supabase.from('profiles').select('id,email,nombre,rol').order('nombre'),
    supabase.from('clients').select('id,slug,nombre,am_id,activo,contexto_ia,roas_objetivo').order('nombre'),
    supabase.from('client_accounts').select('*'),
    todas<any>((a, b) => supabase.from('ad_accounts').select('id,nombre,moneda,zona_horaria,estado_cuenta,bm_id').order('nombre').range(a, b)),
  ]);
  for (const r of [perfiles, clientes, cfg]) if (r.error) throw new Error(r.error.message);
  const cuentasCfg: CfgCuenta[] = (cfg.data || []).map((c: any) => ({
    ad_account_id: c.ad_account_id, client_id: c.client_id, sede: c.sede, canales: c.canales || [],
    presupuesto_semanal: num(c.presupuesto_semanal), cpl_objetivo: num(c.cpl_objetivo), cpl_maximo: num(c.cpl_maximo),
    activa: c.activa, nota: c.nota,
  }));
  return {
    perfiles: (perfiles.data || []) as Perfil[],
    clientes: ((clientes.data || []) as any[]).map((c) => ({ ...c, roas_objetivo: num(c.roas_objetivo) })) as Cliente[],
    cuentasCfg,
    cuentasMeta: cuentas as CuentaMeta[],
    presupuestoMensual: new Map((cfg.data || []).map((c: any) => [c.ad_account_id as string, num(c.presupuesto_mensual)])),
  };
}

const aDia = (r: any): Dia => ({
  ad_account_id: r.ad_account_id, fecha: r.fecha, inversion: Number(r.inversion), impresiones: Number(r.impresiones),
  clics_enlace: Number(r.clics_enlace), leads: r.leads, conversaciones: r.conversaciones, pedidos: r.pedidos,
  alcance: num(r.alcance), frecuencia: num(r.frecuencia),
});

/** Métricas diarias por cuenta desde una fecha. */
export async function diasCuenta(cuentas: string[], desde: string): Promise<Dia[]> {
  if (!cuentas.length) return [];
  const rows = await todas<any>((a, b) => supabase.from('insights_daily')
    .select('ad_account_id,fecha,inversion,impresiones,clics_enlace,leads,conversaciones,pedidos,alcance,frecuencia')
    .eq('nivel', 'account').in('ad_account_id', cuentas).gte('fecha', desde).order('fecha').range(a, b));
  return rows.map(aDia);
}

/** Anuncios con gasto entre dos fechas, sumados por anuncio, con nombres, estado y canal. */
export async function anunciosPeriodo(cuentas: string[], desde: string, hasta: string): Promise<FilaAnuncioCruda[]> {
  if (!cuentas.length) return [];
  const rows = await todas<any>((a, b) => supabase.from('insights_daily')
    .select('objeto_id,ad_account_id,campaign_id,adset_id,inversion,impresiones,alcance,frecuencia,clics_enlace,leads,conversaciones,pedidos')
    .eq('nivel', 'ad').in('ad_account_id', cuentas).gte('fecha', desde).lte('fecha', hasta).gt('inversion', 0).range(a, b));
  const ag = new Map<string, any>();
  for (const r of rows) {
    const t = ag.get(r.objeto_id) || { ad_id: r.objeto_id, ad_account_id: r.ad_account_id, campaign_id: r.campaign_id, adset_id: r.adset_id, inversion: 0, impresiones: 0, alcance: 0, clics_enlace: 0, leads: 0, conversaciones: 0, pedidos: 0, frecuencia: 0 };
    t.inversion += Number(r.inversion); t.impresiones += Number(r.impresiones); t.clics_enlace += Number(r.clics_enlace);
    t.leads += r.leads; t.conversaciones += r.conversaciones; t.pedidos += r.pedidos;
    // Alcance y frecuencia no se suman entre días: se guarda la frecuencia diaria ponderada por impresiones.
    t.frecuencia += Number(r.frecuencia || 0) * Number(r.impresiones);
    ag.set(r.objeto_id, t);
  }
  const ids = [...ag.keys()];
  const [ads, adsets, camps] = await Promise.all([
    porIds('ads', 'id,nombre,estado_efectivo', ids),
    porIds('adsets', 'id,nombre,destino', [...new Set([...ag.values()].map((x) => x.adset_id).filter(Boolean))]),
    porIds('campaigns', 'id,nombre,objetivo', [...new Set([...ag.values()].map((x) => x.campaign_id).filter(Boolean))]),
  ]);
  return [...ag.values()].map((t) => {
    const ad = ads.get(t.ad_id), set = adsets.get(t.adset_id), camp = camps.get(t.campaign_id);
    return {
      ad_id: t.ad_id, ad_account_id: t.ad_account_id, anuncio: ad?.nombre ?? t.ad_id, conjunto: set?.nombre ?? '–', campana: camp?.nombre ?? '–',
      estado: ad?.estado_efectivo ?? null, canal: canalAnuncio(set?.destino, camp?.objetivo, camp?.nombre),
      inversion: t.inversion, leads: t.leads, conversaciones: t.conversaciones, pedidos: t.pedidos,
      impresiones: t.impresiones, alcance: 0, clics_enlace: t.clics_enlace,
      frecuencia: t.impresiones ? t.frecuencia / t.impresiones : null,
    };
  });
}

async function porIds(tabla: string, campos: string, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.from(tabla).select(campos).in('id', ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    (data || []).forEach((r: any) => out.set(r.id, r));
  }
  return out;
}

export async function conjuntosConObservaciones(cuentas: string[]) {
  if (!cuentas.length) return [];
  const { data, error } = await supabase.from('adsets').select('id,ad_account_id,campaign_id,nombre,estado_efectivo,aprendizaje')
    .in('ad_account_id', cuentas).in('estado', ['ACTIVE']).or('aprendizaje.in.(LEARNING,FAIL),estado_efectivo.neq.ACTIVE');
  if (error) throw new Error(error.message);
  const camps = await porIds('campaigns', 'id,nombre', [...new Set((data || []).map((r: any) => r.campaign_id).filter(Boolean))]);
  return (data || []).map((r: any) => ({ ...r, campana: camps.get(r.campaign_id)?.nombre ?? '–' }));
}

export async function ultimaSync(tipo: string) {
  const { data } = await supabase.from('sync_runs').select('terminado_en,estado').eq('tipo', tipo).neq('estado', 'corriendo')
    .order('iniciado_en', { ascending: false }).limit(1).maybeSingle();
  return data as { terminado_en: string; estado: string } | null;
}

/** Frecuencia real de los últimos 7 días cerrados, por anuncio. */
export async function frecuencias7d(cuentas: string[]): Promise<Map<string, { alcance: number | null; frecuencia: number | null }>> {
  if (!cuentas.length) return new Map();
  const rows = await todas<any>((a, b) => supabase.from('frecuencia_7d').select('ad_id,alcance,frecuencia').in('ad_account_id', cuentas).range(a, b));
  return new Map(rows.map((r) => [r.ad_id, { alcance: num(r.alcance), frecuencia: num(r.frecuencia) }]));
}

// ---------------- Fase 2: ventas del CRM ----------------

export interface Carga { id: string; client_id: string; desde: string; hasta: string; fuente: string; nombre: string | null; contexto: string | null; filas: number | null; creado_en: string; creado_por: string | null }

export async function listarCargas(clientes: string[]): Promise<Carga[]> {
  if (!clientes.length) return [];
  const { data, error } = await supabase.from('ventas_cargas').select('*').in('client_id', clientes).order('creado_en', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data as Carga[];
}

export async function guardarCarga(c: { client_id: string; desde: string; hasta: string; nombre: string | null; fuente: string; contexto: string | null }, filas: VentaAnuncio[]): Promise<string> {
  const { data, error } = await supabase.from('ventas_cargas').insert({ ...c, filas: filas.length }).select('id').single();
  if (error) throw new Error(error.message);
  for (let i = 0; i < filas.length; i += 500) {
    const { error: e2 } = await supabase.from('ventas_anuncio').insert(filas.slice(i, i + 500).map((f) => ({ ...f, carga_id: data.id })));
    if (e2) { await supabase.from('ventas_cargas').delete().eq('id', data.id); throw new Error(e2.message); }
  }
  return data.id;
}

export async function ventasDeCarga(id: string): Promise<VentaAnuncio[]> {
  const rows = await todas<any>((a, b) => supabase.from('ventas_anuncio').select('*').eq('carga_id', id).range(a, b));
  return rows.map((r) => ({ ad_id: r.ad_id, sede_crm: r.sede_crm, pre_leads: r.pre_leads, leads: r.leads, ordenes: r.ordenes, monto: Number(r.monto), por_cobrar: Number(r.por_cobrar), cobrado: Number(r.cobrado), enlaces: r.enlaces }));
}

export async function borrarCarga(id: string) {
  const { error } = await supabase.from('ventas_cargas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface Analisis { id: string; tipo: 'cliente' | 'paid'; estado: 'generando' | 'listo' | 'error'; contenido: string | null; error: string | null; contexto: string | null; modelo: string | null; creado_en: string }

export async function analisisDeCarga(id: string): Promise<Analisis[]> {
  const { data, error } = await supabase.from('analisis_ia').select('id,tipo,estado,contenido,error,contexto,modelo,creado_en').eq('carga_id', id).order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Analisis[];
}

/** Primer día con datos de Meta guardados para estas cuentas. */
export async function primerDiaMeta(cuentas: string[]): Promise<string | null> {
  if (!cuentas.length) return null;
  const { data } = await supabase.from('insights_daily').select('fecha').eq('nivel', 'account').in('ad_account_id', cuentas).order('fecha').limit(1).maybeSingle();
  return (data as any)?.fecha ?? null;
}

export async function guardarContextoCliente(id: string, contexto_ia: string | null, roas_objetivo: number | null) {
  const { error } = await supabase.from('clients').update({ contexto_ia, roas_objetivo }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function guardarContextoCarga(id: string, contexto: string | null) {
  const { error } = await supabase.from('ventas_cargas').update({ contexto }).eq('id', id);
  if (error) throw new Error(error.message);
}
