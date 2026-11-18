// Reglas de negocio del panel táctico. Sin dependencias de React ni de Supabase: se prueban solas.
import { sumarDias } from '../shared/fechas';

export type Nivel = 'critico' | 'atencion' | 'ok' | 'sin' | 'inactiva' | 'info';
export const PESO: Record<Nivel, number> = { critico: 4, atencion: 3, ok: 2, sin: 1, inactiva: 0, info: 0 };
export const ORDEN: Record<Nivel, number> = { critico: 0, atencion: 1, ok: 2, sin: 3, info: 4, inactiva: 5 };

export interface CfgCuenta {
  ad_account_id: string;
  client_id: string;
  sede: string | null;
  canales: string[];
  presupuesto_semanal: number | null;
  cpl_objetivo: number | null;
  cpl_maximo: number | null;
  activa: boolean;
  nota: string | null;
}

export interface CuentaMeta {
  id: string;
  nombre: string;
  moneda: string | null;
  zona_horaria: string | null;
  estado_cuenta: number | null;
  bm_id: string | null;
}

export interface Dia {
  ad_account_id: string;
  fecha: string;
  inversion: number;
  impresiones: number;
  clics_enlace: number;
  leads: number;
  conversaciones: number;
  pedidos: number;
  alcance?: number | null;
  frecuencia?: number | null;
}

export const ESTADO_CUENTA: Record<number, string> = {
  1: 'Activa', 2: 'Deshabilitada', 3: 'Pago pendiente', 7: 'En revisión', 8: 'Cerrándose', 9: 'Período de gracia', 100: 'Cierre pendiente', 101: 'Cerrada',
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const f2 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const suma = <T,>(rs: T[], f: (r: T) => number) => rs.reduce((s, r) => s + f(r), 0);

/** Resultado según los canales de la cuenta: formulario cuenta leads; mensajería cuenta conversaciones. */
export function resultado(d: Pick<Dia, 'leads' | 'conversaciones'>, canales: string[]): number {
  const form = canales.includes('Formulario');
  const mens = canales.length === 0 || canales.some((c) => c === 'WhatsApp' || c === 'Messenger' || c === 'Instagram');
  return (form ? n(d.leads) : 0) + (mens ? n(d.conversaciones) : 0);
}

const esInicio = (nota: string | null) => /inici/i.test(nota || '');

// ---------------- Operación del día ----------------

export interface FilaDia {
  ad_account_id: string;
  hora: number | null;
  avance_pct: number | null;
  presupuesto_diario: number | null;
  inversion: number;
  ritmo_pct: number | null;
  resultados: number;
  cpr: number | null;
  pedidos: number;
  nivel: Nivel;
  motivo: string;
}

export function evaluarDia(cfg: CfgCuenta, fila: Dia | undefined, hora: number | null, ayer: boolean): FilaDia {
  const h = ayer ? 24 : hora;
  const avance = h == null ? null : Math.min(1, h / 24);
  const diario = cfg.presupuesto_semanal ? cfg.presupuesto_semanal / 7 : null;
  const esperado = diario != null && avance != null ? diario * avance : null;
  const inv = n(fila?.inversion);
  const res = fila ? resultado(fila, cfg.canales) : 0;
  const cpr = res ? inv / res : null;
  const ritmo = esperado ? (inv / esperado) * 100 : null;
  const motivos: string[] = [];
  let nivel: Nivel = cfg.activa ? 'ok' : 'inactiva';
  const subir = (x: Nivel, t?: string) => { if (PESO[x] > PESO[nivel]) nivel = x; if (t) motivos.push(t); };

  if (!cfg.activa) { if (cfg.nota) motivos.push(cfg.nota); }
  else if (inv === 0 && esInicio(cfg.nota)) { nivel = 'sin'; motivos.push(cfg.nota!); }
  else if (inv === 0) {
    if (avance != null && avance >= 0.25) subir('critico', ayer ? 'No invirtió ayer' : 'Sin entrega hoy');
    else { nivel = 'sin'; motivos.push('Todavía temprano en la zona de la cuenta'); }
  } else {
    if (res === 0 && cfg.cpl_maximo != null && inv >= 2 * cfg.cpl_maximo) subir('critico', `Sin resultados con ${f2(inv)} invertidos`);
    if (ritmo != null && avance != null && avance >= 0.15) {
      const bajo = ayer ? 80 : 60, alto = ayer ? 120 : 140;
      if (ritmo < bajo) subir('atencion', `Ritmo bajo: ${Math.round(ritmo)}% de lo esperado`);
      else if (ritmo > alto) subir('atencion', `Ritmo alto: ${Math.round(ritmo)}% de lo esperado`);
    }
    if (res >= 3 && cfg.cpl_maximo != null && cpr! > cfg.cpl_maximo) subir('atencion', `CPL ${f2(cpr!)}, sobre el máximo de ${f2(cfg.cpl_maximo)}`);
  }
  return {
    ad_account_id: cfg.ad_account_id, hora: h, avance_pct: avance == null ? null : avance * 100, presupuesto_diario: diario,
    inversion: inv, ritmo_pct: ritmo, resultados: res, cpr, pedidos: n(fila?.pedidos), nivel, motivo: motivos.join(' · '),
  };
}

export function ritmoOk(ritmo: number, ayer: boolean) {
  return ritmo >= (ayer ? 80 : 60) && ritmo <= (ayer ? 120 : 140);
}

// ---------------- Últimos 7 días ----------------

export interface FilaSemana {
  ad_account_id: string;
  inv_7d: number;
  inv_prev: number;
  pacing_pct: number | null;
  resultados_7d: number;
  resultados_prev: number;
  cpr_7d: number | null;
  cpr_var_pct: number | null;
  ctr_7d: number | null;
  cpm_7d: number | null;
  pedidos_7d: number;
  conversaciones_7d: number;
  costo_pedido: number | null;
  dias_sin_entrega: number | null;
  estado_meta: string;
  nivel: Nivel;
  motivo: string;
  desde: string;
  hasta: string;
}

/** `corte` = último día completo en la zona de la cuenta (ayer). */
export function evaluarSemana(cfg: CfgCuenta, meta: CuentaMeta | undefined, filas: Dia[], corte: string): FilaSemana {
  const d7 = sumarDias(corte, -6), p7 = sumarDias(corte, -13);
  const a = filas.filter((r) => r.fecha >= d7 && r.fecha <= corte);
  const p = filas.filter((r) => r.fecha >= p7 && r.fecha < d7);
  const inv = suma(a, (r) => n(r.inversion)), pinv = suma(p, (r) => n(r.inversion));
  const res = suma(a, (r) => resultado(r, cfg.canales)), pres = suma(p, (r) => resultado(r, cfg.canales));
  const imp = suma(a, (r) => n(r.impresiones)), clk = suma(a, (r) => n(r.clics_enlace));
  const ped = suma(a, (r) => n(r.pedidos)), conv = suma(a, (r) => n(r.conversaciones));
  const cpr = res ? inv / res : null, pcpr = pres ? pinv / pres : null;
  const conEntrega = new Set(a.filter((r) => n(r.inversion) > 0).map((r) => r.fecha)).size;
  const dias_sin_entrega = inv > 0 ? 7 - conEntrega : null;
  const pacing = cfg.presupuesto_semanal ? (inv / cfg.presupuesto_semanal) * 100 : null;
  const motivos: string[] = [];
  let nivel: Nivel = !cfg.activa ? 'inactiva' : inv > 0 ? 'ok' : 'sin';
  const subir = (x: Nivel, t?: string) => { if (PESO[x] > PESO[nivel]) nivel = x; if (t) motivos.push(t); };

  if (!meta || !meta.bm_id) { nivel = 'info'; motivos.push('Ningún usuario de sistema conectado ve esta cuenta'); }
  else if (!cfg.activa) { if (cfg.nota) motivos.push(cfg.nota); if (inv > 0) subir('atencion', 'Marcada inactiva pero invirtió esta semana'); }
  else {
    if (meta.estado_cuenta != null && meta.estado_cuenta !== 1) subir('critico', meta.estado_cuenta === 2 ? 'Cuenta deshabilitada por Meta' : meta.estado_cuenta === 3 ? 'Pago pendiente en Meta' : `Estado de cuenta: ${ESTADO_CUENTA[meta.estado_cuenta] ?? meta.estado_cuenta}`);
    if (inv > 0) {
      if (res === 0) subir('critico', 'Invierte sin resultados');
      else if (cfg.cpl_maximo != null && cpr! > cfg.cpl_maximo) subir('critico', `CPL ${f2(cpr!)}, sobre el máximo de ${f2(cfg.cpl_maximo)}`);
      else if (cfg.cpl_objetivo != null && cpr! > cfg.cpl_objetivo) subir('atencion', `CPL ${f2(cpr!)}, sobre el objetivo de ${f2(cfg.cpl_objetivo)}`);
      if (pacing != null) {
        if (pacing < 80 || pacing > 120) subir('critico', `Pacing semanal ${Math.round(pacing)}% del presupuesto`);
        else if (pacing < 90 || pacing > 110) subir('atencion', `Pacing semanal ${Math.round(pacing)}% del presupuesto`);
      }
      if (dias_sin_entrega! >= 2) subir('atencion', `${dias_sin_entrega} días sin entrega`);
      else if (dias_sin_entrega === 1) subir('ok', '1 día sin entrega');
    } else if (esInicio(cfg.nota)) motivos.push(cfg.nota!);
    else if (pinv > 0) subir('critico', 'Dejó de invertir esta semana');
    else subir('atencion', 'Activa pero sin inversión en 14 días');
  }
  return {
    ad_account_id: cfg.ad_account_id, inv_7d: inv, inv_prev: pinv, pacing_pct: pacing, resultados_7d: res, resultados_prev: pres,
    cpr_7d: cpr, cpr_var_pct: cpr != null && pcpr ? (cpr / pcpr - 1) * 100 : null,
    ctr_7d: imp ? (clk / imp) * 100 : null, cpm_7d: imp ? (inv / imp) * 1000 : null,
    pedidos_7d: ped, conversaciones_7d: conv, costo_pedido: ped ? inv / ped : null, dias_sin_entrega,
    estado_meta: !meta ? 'Sin dato' : ESTADO_CUENTA[meta.estado_cuenta ?? -1] ?? '–', nivel, motivo: motivos.join(' · '), desde: d7, hasta: corte,
  };
}

export interface TotalCliente {
  inv_7d: number;
  presupuesto_semanal: number | null;
  pacing_pct: number | null;
  resultados_7d: number;
  cpr_7d: number | null;
  cpl_objetivo: number | null;
  cpl_maximo: number | null;
  cpr_var_pct: number | null;
  pedidos_7d: number;
  costo_pedido: number | null;
  cuentas_con_inversion: number;
  cuentas_total: number;
  nivel: Nivel;
  motivo: string;
}

/** Objetivo y máximo del cliente: ponderados por presupuesto semanal (media armónica, como CPL). */
export function totalCliente(cuentas: { cfg: CfgCuenta; sem: FilaSemana; nombre: string }[]): TotalCliente {
  const activas = cuentas.filter((c) => c.sem.nivel !== 'inactiva');
  const inv = suma(cuentas, (c) => c.sem.inv_7d), res = suma(cuentas, (c) => c.sem.resultados_7d);
  const pinv = suma(cuentas, (c) => c.sem.inv_prev), pres = suma(cuentas, (c) => c.sem.resultados_prev);
  const conPres = activas.filter((c) => c.cfg.presupuesto_semanal);
  const presSem = suma(conPres, (c) => c.cfg.presupuesto_semanal!);
  const pond = (campo: 'cpl_objetivo' | 'cpl_maximo') => {
    const xs = activas.filter((c) => c.cfg.presupuesto_semanal && c.cfg[campo]);
    return xs.length ? suma(xs, (c) => c.cfg.presupuesto_semanal!) / suma(xs, (c) => c.cfg.presupuesto_semanal! / c.cfg[campo]!) : null;
  };
  let nivel: Nivel = cuentas.length && cuentas.every((c) => c.sem.nivel === 'inactiva') ? 'inactiva' : 'sin';
  for (const c of cuentas) if (PESO[c.sem.nivel] > PESO[nivel]) nivel = c.sem.nivel;
  const varias = cuentas.length > 1;
  const alertas = cuentas.filter((c) => c.sem.nivel === 'critico' || c.sem.nivel === 'atencion').map((c) => (varias ? c.nombre + ': ' : '') + c.sem.motivo);
  const notas = cuentas.filter((c) => c.sem.motivo && c.sem.nivel !== 'critico' && c.sem.nivel !== 'atencion').map((c) => c.sem.motivo);
  const ped = suma(cuentas, (c) => c.sem.pedidos_7d);
  return {
    inv_7d: inv, presupuesto_semanal: presSem || null,
    pacing_pct: presSem ? (suma(conPres, (c) => c.sem.inv_7d) / presSem) * 100 : null,
    resultados_7d: res, cpr_7d: res ? inv / res : null, cpl_objetivo: pond('cpl_objetivo'), cpl_maximo: pond('cpl_maximo'),
    cpr_var_pct: res && pres ? ((inv / res) / (pinv / pres) - 1) * 100 : null,
    pedidos_7d: ped, costo_pedido: ped ? inv / ped : null,
    cuentas_con_inversion: cuentas.filter((c) => c.sem.inv_7d > 0).length, cuentas_total: cuentas.length,
    nivel, motivo: alertas.length ? alertas.join(' | ') : notas.join(' · '),
  };
}

export function pacingTono(v: number | null): '' | 'bien' | 'aviso' | 'mal' {
  return v == null ? '' : v >= 90 && v <= 110 ? 'bien' : v >= 80 && v <= 120 ? 'aviso' : 'mal';
}

export function cplTono(cpr: number | null, obj: number | null, max: number | null): '' | 'bien' | 'aviso' | 'mal' {
  if (cpr == null) return '';
  if (max != null && cpr > max) return 'mal';
  if (obj != null && cpr > obj) return 'aviso';
  return obj != null ? 'bien' : '';
}

// ---------------- Anuncios ----------------

export type Veredicto = 'Ganador' | 'Atención' | 'Observar' | 'Pausar' | 'Poco dato' | 'Sin objetivo' | 'Sin gasto';

export function veredicto(inv: number, res: number, obj: number | null, max: number | null): Veredicto {
  const cpr = res ? inv / res : null;
  if (inv === 0) return 'Sin gasto';
  if (res === 0) return max != null && inv >= 2 * max ? 'Pausar' : 'Poco dato';
  if (obj != null && cpr! <= obj) return 'Ganador';
  if (max != null && cpr! <= max) return 'Atención';
  if (max != null) return res >= 3 && inv >= 2 * max ? 'Pausar' : 'Observar';
  return 'Sin objetivo';
}

export const VEREDICTO_NIVEL: Partial<Record<Veredicto, Nivel>> = { Ganador: 'ok', 'Atención': 'atencion', Observar: 'atencion', Pausar: 'critico' };

export type Canal = 'Formulario' | 'WhatsApp' | 'Messenger' | 'Instagram' | 'Otro';

/** Canal del anuncio: primero el destino del conjunto; si falta, objetivo y nombre de la campaña. */
export function canalAnuncio(destino: string | null | undefined, objetivo: string | null | undefined, campana: string | null | undefined): Canal {
  const d = String(destino || '').toUpperCase();
  if (d === 'ON_AD' || d.includes('LEAD')) return 'Formulario';
  if (d.includes('WHATSAPP')) return 'WhatsApp';
  if (d.includes('MESSENGER')) return 'Messenger';
  if (d.includes('INSTAGRAM')) return 'Instagram';
  const c = String(campana || '').toUpperCase();
  if (objetivo === 'OUTCOME_LEADS' || /\bFORM/.test(c)) return 'Formulario';
  if (/\bMESS/.test(c)) return 'Messenger';
  if (/WAPP|WSP|WHATSAPP|CTWA/.test(c)) return 'WhatsApp';
  return 'Otro';
}

export function resultadoAnuncio(canal: Canal, leads: number, conversaciones: number): number {
  if (canal === 'Formulario') return leads;
  if (canal === 'Otro') return leads + conversaciones;
  return conversaciones;
}

export interface Anuncio {
  ad_id: string;
  ad_account_id: string;
  anuncio: string;
  campana: string;
  conjunto: string;
  estado: string | null;
  canal: Canal;
  inversion: number;
  resultados: number;
  leads: number;
  conversaciones: number;
  pedidos: number;
  impresiones: number;
  alcance: number;
  clics_enlace: number;
  frecuencia: number | null;
  cpr: number | null;
  cpl_objetivo: number | null;
  cpl_maximo: number | null;
  share_total: number;
  share_canal: number;
  veredicto: Veredicto;
  fatiga: boolean;
}

export interface FilaAnuncioCruda {
  ad_id: string; ad_account_id: string; anuncio: string; campana: string; conjunto: string; estado: string | null; canal: Canal;
  inversion: number; leads: number; conversaciones: number; pedidos: number; impresiones: number; alcance: number; clics_enlace: number; frecuencia: number | null;
}

/** Agrupa filas diarias por anuncio (alcance y frecuencia: se toma la del período si viene, si no la máxima diaria). */
export function armarAnuncios(filas: FilaAnuncioCruda[], cfgPorCuenta: Map<string, CfgCuenta>): Anuncio[] {
  const total = suma(filas, (r) => r.inversion);
  const porCanal: Record<string, number> = {};
  filas.forEach((r) => { porCanal[r.canal] = (porCanal[r.canal] || 0) + r.inversion; });
  return filas.map((r) => {
    const c = cfgPorCuenta.get(r.ad_account_id);
    const res = resultadoAnuncio(r.canal, r.leads, r.conversaciones);
    const obj = c?.cpl_objetivo ?? null, max = c?.cpl_maximo ?? null;
    return {
      ...r, resultados: res, cpr: res ? r.inversion / res : null, cpl_objetivo: obj, cpl_maximo: max,
      share_total: total ? (r.inversion / total) * 100 : 0, share_canal: porCanal[r.canal] ? (r.inversion / porCanal[r.canal]) * 100 : 0,
      veredicto: veredicto(r.inversion, res, obj, max), fatiga: (r.frecuencia ?? 0) > 3,
    };
  }).sort((a, b) => b.inversion - a.inversion);
}

export interface ResumenPeriodo {
  anuncios: number; activos: number; inversion: number; resultados: number; leads: number; conversaciones: number; pedidos: number;
  cpr: number | null; cpl_objetivo: number | null; cpl_maximo: number | null; desvio_pct: number | null;
  impresiones: number; clics_enlace: number; ctr: number | null; cpm: number | null; frecuencia: number | null; costo_pedido: number | null;
}

export function resumir(rs: Anuncio[]): ResumenPeriodo {
  const s = (f: keyof Anuncio) => suma(rs, (r) => n(r[f]));
  const inv = s('inversion'), res = s('resultados'), imp = s('impresiones'), clk = s('clics_enlace'), ped = s('pedidos');
  const conObj = rs.filter((r) => r.cpl_objetivo != null && r.inversion > 0);
  const peso = suma(conObj, (r) => r.inversion);
  const obj = peso ? suma(conObj, (r) => r.cpl_objetivo! * r.inversion) / peso : null;
  const max = peso ? suma(conObj, (r) => (r.cpl_maximo ?? r.cpl_objetivo!) * r.inversion) / peso : null;
  const cpr = res ? inv / res : null;
  return {
    anuncios: rs.length, activos: rs.filter((r) => r.estado === 'ACTIVE').length, inversion: inv, resultados: res,
    leads: s('leads'), conversaciones: s('conversaciones'), pedidos: ped, cpr, cpl_objetivo: obj, cpl_maximo: max,
    desvio_pct: cpr != null && obj ? (cpr / obj - 1) * 100 : null, impresiones: imp, clics_enlace: clk,
    ctr: imp ? (clk / imp) * 100 : null, cpm: imp ? (inv / imp) * 1000 : null,
    frecuencia: imp ? suma(rs, (r) => n(r.frecuencia) * r.impresiones) / imp : null, costo_pedido: ped ? inv / ped : null,
  };
}

/** Frases de lectura del período, en el lenguaje del AM. */
export function lectura(rs: Anuncio[], r: ResumenPeriodo, dinero: (v: number) => string, porCanal: boolean): string[] {
  const out: string[] = [];
  const p0 = (v: number) => Math.round(v).toLocaleString('es-AR') + '%';
  if (!rs.length) return ['No hubo anuncios con gasto en este período.'];
  if (r.cpr != null && r.cpl_objetivo != null && r.cpl_maximo != null) {
    const dentro = r.cpr <= r.cpl_objetivo ? `, dentro del objetivo de ${dinero(r.cpl_objetivo)}`
      : r.cpr <= r.cpl_maximo ? `, ${p0(r.desvio_pct!)} sobre el objetivo pero dentro del máximo de ${dinero(r.cpl_maximo)}`
      : `, sobre el máximo de ${dinero(r.cpl_maximo)}`;
    out.push(`CPL de ${dinero(r.cpr)}${dentro}, con ${r.resultados.toLocaleString('es-AR')} resultados y ${dinero(r.inversion)} invertidos.`);
  } else if (r.cpr == null) out.push(`Se invirtieron ${dinero(r.inversion)} sin resultados registrados.`);
  const conRes = rs.filter((a) => a.resultados >= 3 && a.cpr != null);
  if (conRes.length >= 2) {
    const mejor = conRes.reduce((a, b) => (b.cpr! < a.cpr! ? b : a)), peor = conRes.reduce((a, b) => (b.cpr! > a.cpr! ? b : a));
    out.push(`Mejor anuncio: ${mejor.anuncio}, CPL ${dinero(mejor.cpr!)} con ${mejor.resultados} resultados. Peor: ${peor.anuncio}, CPL ${dinero(peor.cpr!)}.`);
  }
  const top = rs[0];
  const share = porCanal ? top.share_canal : top.share_total;
  if (rs.length > 1 && share >= 50) out.push(`${top.anuncio} concentra el ${p0(share)} del gasto; si se fatiga, se pierde volumen.`);
  const sinRes = rs.filter((a) => a.resultados === 0 && a.cpl_maximo != null && a.inversion >= 2 * a.cpl_maximo);
  if (sinRes.length) out.push(`${sinRes.length} ${sinRes.length === 1 ? 'anuncio gastó' : 'anuncios gastaron'} más de dos CPL máximos sin resultados: ${sinRes.slice(0, 3).map((a) => a.anuncio).join(', ')}.`);
  const inactivos = rs.filter((a) => a.estado !== 'ACTIVE');
  if (inactivos.length) out.push(`${inactivos.length} de ${rs.length} anuncios con gasto en el período hoy no están activos.`);
  if (r.pedidos > 0) out.push(`${r.pedidos.toLocaleString('es-AR')} pedidos creados, a ${dinero(r.costo_pedido!)} por pedido${r.conversaciones ? ` (${(r.pedidos / r.conversaciones * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% de las conversaciones)` : ''}.`);
  if (r.frecuencia != null && r.frecuencia > 2.5) out.push(`Frecuencia promedio de ${r.frecuencia.toLocaleString('es-AR', { maximumFractionDigits: 2 })}: revisar saturación de audiencia.`);
  return out;
}

// ---------------- Entrega de conjuntos ----------------

const SUBESTADO: Record<string, string> = { LEARNING: 'En aprendizaje', FAIL: 'Aprendizaje limitado' };
const EFECTIVO: Record<string, string> = { WITH_ISSUES: 'Con problemas', PENDING_BILLING_INFO: 'Pago pendiente', IN_PROCESS: 'En proceso', PENDING_REVIEW: 'En revisión', DISAPPROVED: 'Rechazado' };

export function observacionConjunto(estadoEfectivo: string | null, aprendizaje: string | null): { texto: string; grave: boolean } | null {
  const obs: string[] = [];
  if (estadoEfectivo && estadoEfectivo !== 'ACTIVE' && EFECTIVO[estadoEfectivo]) obs.push(EFECTIVO[estadoEfectivo]);
  if (aprendizaje && SUBESTADO[aprendizaje]) obs.push(SUBESTADO[aprendizaje]);
  if (!obs.length) return null;
  return { texto: obs.join(' · '), grave: aprendizaje === 'FAIL' || (estadoEfectivo != null && ['WITH_ISSUES', 'PENDING_BILLING_INFO', 'DISAPPROVED'].includes(estadoEfectivo)) };
}
