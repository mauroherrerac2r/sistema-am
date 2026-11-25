// Panel de Paid Media: estado de creativos y motor de recomendaciones por cuenta.
// Lógica pura (sin React ni Supabase): se prueba sola en tests/reglasPM.test.ts.
import { canalAnuncio, resultadoAnuncio, veredicto, Veredicto, CfgCuenta, CuentaMeta, FilaDia, FilaSemana, ESTADO_CUENTA, Canal } from './reglas';

export interface AdDiario { ad_id: string; ad_account_id: string; adset_id: string | null; campaign_id: string | null; fecha: string; inversion: number; impresiones: number; clics_enlace: number; leads: number; conversaciones: number }
export interface AdInfo { id: string; nombre: string; estado_efectivo: string | null; miniatura: string | null; formato: string | null; creado_meta: string | null; adset_id: string | null; campaign_id: string | null }
export interface AdsetInfo { id: string; ad_account_id: string; campaign_id: string | null; nombre: string; estado_efectivo: string | null; presupuesto_diario: number | null; aprendizaje: string | null; destino: string | null }
export interface CampanaInfo { id: string; nombre: string; objetivo: string | null; presupuesto_diario: number | null; estado_efectivo: string | null }

export type EstadoCreativo = 'Ganador' | 'Fatiga' | 'Pausar' | 'Observar' | 'Poco dato';

export interface Creativo {
  ad_id: string; ad_account_id: string; nombre: string; conjunto: string; campana: string; adset_id: string | null; canal: Canal;
  activo: boolean; miniatura: string | null; formato: string; dias: number;
  inversion: number; resultados: number; cpr: number | null; impresiones: number; clics: number; ctr: number | null;
  frecuencia: number | null; serieCtr: number[]; serieCpl: (number | null)[]; fechas: string[];
  caidaCtr: number | null; share: number; veredicto: Veredicto; estado: EstadoCreativo; lectura: string;
  cpl_objetivo: number | null; cpl_maximo: number | null;
}

const FORMATO: Record<string, string> = { VIDEO: 'Video', PHOTO: 'Imagen', SHARE: 'Carrusel o link', STATUS: 'Publicación', OFFER: 'Oferta', INVALID: '–' };
const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Agrega los anuncios por período y decide su estado:
 * Pausar (veredicto) > Fatiga (frecuencia 7 días > 3, o CTR cae 30% o más entre los primeros y los últimos 3 días con datos) > Ganador > Observar.
 */
export function armarCreativos(diarios: AdDiario[], ads: Map<string, AdInfo>, adsets: Map<string, AdsetInfo>, campanas: Map<string, CampanaInfo>,
  cfgPorCuenta: Map<string, CfgCuenta>, frec7: Map<string, number | null>, fechas: string[], hoy: string): Creativo[] {
  const porAd = new Map<string, AdDiario[]>();
  diarios.forEach((d) => porAd.set(d.ad_id, [...(porAd.get(d.ad_id) || []), d]));
  const totalCuenta = new Map<string, number>();
  diarios.forEach((d) => totalCuenta.set(d.ad_account_id, (totalCuenta.get(d.ad_account_id) || 0) + d.inversion));
  const out: Creativo[] = [];
  for (const [id, filas] of porAd) {
    const info = ads.get(id);
    const set = adsets.get(filas[0].adset_id ?? '') ?? null;
    const camp = campanas.get(filas[0].campaign_id ?? '') ?? null;
    const canal = canalAnuncio(set?.destino, camp?.objetivo, camp?.nombre);
    const cfg = cfgPorCuenta.get(filas[0].ad_account_id);
    const porFecha = new Map(filas.map((f) => [f.fecha, f]));
    const serieCtr = fechas.map((f) => { const x = porFecha.get(f); return x && x.impresiones ? (x.clics_enlace / x.impresiones) * 100 : 0; });
    const serieCpl = fechas.map((f) => { const x = porFecha.get(f); if (!x) return null; const r = resultadoAnuncio(canal, x.leads, x.conversaciones); return r ? x.inversion / r : null; });
    const inv = filas.reduce((t, f) => t + f.inversion, 0), imp = filas.reduce((t, f) => t + f.impresiones, 0), clk = filas.reduce((t, f) => t + f.clics_enlace, 0);
    const res = filas.reduce((t, f) => t + resultadoAnuncio(canal, f.leads, f.conversaciones), 0);
    const conDatos = fechas.map((f, i) => ({ f, ctr: serieCtr[i], imp: porFecha.get(f)?.impresiones ?? 0 })).filter((x) => x.imp >= 300);
    const ini = prom(conDatos.slice(0, 3).map((x) => x.ctr)), fin = prom(conDatos.slice(-3).map((x) => x.ctr));
    const caida = conDatos.length >= 6 && ini > 0 ? (fin / ini - 1) * 100 : null;
    const frecuencia = frec7.get(id) ?? null;
    const v = veredicto(inv, res, cfg?.cpl_objetivo ?? null, cfg?.cpl_maximo ?? null);
    const activo = info?.estado_efectivo === 'ACTIVE';
    const desde = info?.creado_meta ? info.creado_meta.slice(0, 10) : fechas.find((f) => porFecha.has(f)) ?? hoy;
    const dias = Math.max(1, Math.round((Date.parse(hoy) - Date.parse(desde)) / 864e5) + 1);
    const fatiga = (frecuencia ?? 0) > 3 || (caida != null && caida <= -30);
    const cpr = res ? inv / res : null;
    // Para el PM, "Pausar" exige evidencia fuerte: gasto sin resultados, o CPL más de 20% sobre el máximo.
    // Un anuncio apenas arriba del máximo queda en "Observar".
    const max = cfg?.cpl_maximo ?? null;
    const pausar = v === 'Pausar' && (res === 0 || (max != null && cpr != null && cpr > max * 1.2));
    const estado: EstadoCreativo = pausar ? 'Pausar' : fatiga ? 'Fatiga' : v === 'Ganador' ? 'Ganador' : v === 'Poco dato' || v === 'Sin gasto' ? 'Poco dato' : 'Observar';
    const lectura = estado === 'Pausar' ? 'Gasta sin resultados suficientes o con CPL sobre el máximo: no es fatiga, el anuncio no está convirtiendo.'
      : estado === 'Fatiga' ? `La audiencia ya lo vio${frecuencia != null ? ` (frecuencia ${frecuencia.toFixed(1)})` : ''}${caida != null ? ` y el CTR cayó ${Math.abs(Math.round(caida))}%` : ''}: preparar un reemplazo.`
      : estado === 'Ganador' ? 'CPL dentro del objetivo: candidato a recibir más presupuesto mientras no suba la frecuencia.'
      : estado === 'Poco dato' ? 'Todavía no tiene resultados suficientes para juzgarlo.' : 'Entre el objetivo y el máximo: seguirlo de cerca.';
    out.push({
      ad_id: id, ad_account_id: filas[0].ad_account_id, nombre: info?.nombre ?? id, conjunto: set?.nombre ?? '–', campana: camp?.nombre ?? '–', adset_id: filas[0].adset_id, canal,
      activo, miniatura: info?.miniatura ?? null, formato: FORMATO[info?.formato ?? ''] ?? (info?.formato || '–'), dias,
      inversion: inv, resultados: res, cpr, impresiones: imp, clics: clk, ctr: imp ? (clk / imp) * 100 : null, frecuencia,
      serieCtr, serieCpl, fechas, caidaCtr: caida, share: totalCuenta.get(filas[0].ad_account_id) ? (inv / totalCuenta.get(filas[0].ad_account_id)!) * 100 : 0,
      veredicto: v, estado, lectura, cpl_objetivo: cfg?.cpl_objetivo ?? null, cpl_maximo: cfg?.cpl_maximo ?? null,
    });
  }
  return out.sort((a, b) => b.inversion - a.inversion);
}

export interface Conjunto { id: string; ad_account_id: string; nombre: string; campana: string; activo: boolean; presupuesto: number | null; aprendizaje: string | null; inversion: number; resultados: number; cpr: number | null; share: number }

export function armarConjuntos(creativos: Creativo[], adsets: Map<string, AdsetInfo>, campanas: Map<string, CampanaInfo>): Conjunto[] {
  const g = new Map<string, Creativo[]>();
  creativos.forEach((c) => c.adset_id && g.set(c.adset_id, [...(g.get(c.adset_id) || []), c]));
  const totalCuenta = new Map<string, number>();
  creativos.forEach((c) => totalCuenta.set(c.ad_account_id, (totalCuenta.get(c.ad_account_id) || 0) + c.inversion));
  return [...g.entries()].map(([id, cs]) => {
    const s = adsets.get(id);
    const inv = cs.reduce((t, c) => t + c.inversion, 0), res = cs.reduce((t, c) => t + c.resultados, 0);
    return { id, ad_account_id: cs[0].ad_account_id, nombre: s?.nombre ?? cs[0].conjunto, campana: campanas.get(s?.campaign_id ?? '')?.nombre ?? cs[0].campana,
      activo: s?.estado_efectivo === 'ACTIVE', presupuesto: s?.presupuesto_diario ?? null, aprendizaje: s?.aprendizaje ?? null,
      inversion: inv, resultados: res, cpr: res ? inv / res : null, share: totalCuenta.get(cs[0].ad_account_id) ? (inv / totalCuenta.get(cs[0].ad_account_id)!) * 100 : 0 };
  }).sort((a, b) => b.inversion - a.inversion);
}

// ---------------- Recomendaciones ----------------

export type Prioridad = 'Urgente' | 'Oportunidad' | 'Revisar';
export const ORDEN_PRIORIDAD: Record<Prioridad, number> = { Urgente: 0, Oportunidad: 1, Revisar: 2 };

export interface Reco {
  clave: string; ad_account_id: string; prioridad: Prioridad; tipo: string; origen: 'Regla automática' | 'Brief del AM';
  accion: string; porque: string; impacto: string; peso: number; ad_id?: string; creativa: boolean;
}

export interface CuentaPM { cfg: CfgCuenta; meta?: CuentaMeta; nombre: string; moneda: string | null; dia: FilaDia; sem: FilaSemana }
export interface BriefAM { client_id: string; fecha: string; carga_id: string }

/** Reglas sobre los datos ya sincronizados. `peso` ordena dentro de la misma prioridad (plata involucrada). */
export function generarRecos(cuentas: CuentaPM[], creativos: Creativo[], conjuntos: Conjunto[], briefs: BriefAM[], dinero: (v: number, m: string | null) => string): Reco[] {
  const out: Reco[] = [];
  for (const c of cuentas) {
    const id = c.cfg.ad_account_id, m = c.moneda, d = (v: number) => dinero(v, m);
    if (!c.cfg.activa) continue;
    if (c.meta?.estado_cuenta != null && c.meta.estado_cuenta !== 1) {
      out.push({ clave: `cuenta:${id}`, ad_account_id: id, prioridad: 'Urgente', tipo: 'Entrega', origen: 'Regla automática', creativa: false,
        accion: `Resolver el estado de la cuenta en Meta: ${ESTADO_CUENTA[c.meta.estado_cuenta] ?? c.meta.estado_cuenta}.`, porque: 'Mientras no se resuelva, la cuenta no entrega.',
        impacto: c.cfg.presupuesto_semanal ? `Recupera ~${d(c.cfg.presupuesto_semanal)}/semana de entrega` : 'Recupera la entrega', peso: c.cfg.presupuesto_semanal ?? 0 });
    } else if (/Sin entrega hoy|No invirtió ayer/.test(c.dia.motivo)) {
      out.push({ clave: `sinentrega:${id}`, ad_account_id: id, prioridad: 'Urgente', tipo: 'Entrega', origen: 'Regla automática', creativa: false,
        accion: 'Revisar por qué la cuenta no está entregando hoy.', porque: c.dia.motivo, impacto: c.dia.presupuesto_diario ? `${d(c.dia.presupuesto_diario)} por día sin invertir` : 'Entrega del día', peso: c.dia.presupuesto_diario ?? 0 });
    }
    if (c.sem.nivel === 'critico' && /CPL .*sobre el máximo|Invierte sin resultados/.test(c.sem.motivo)) {
      out.push({ clave: `cplcuenta:${id}`, ad_account_id: id, prioridad: 'Urgente', tipo: 'CPL', origen: 'Regla automática', creativa: false,
        accion: 'Bajar el CPL de la cuenta: revisar conjuntos y anuncios que más gastan.', porque: c.sem.motivo.split(' · ')[0], impacto: `${d(c.sem.inv_7d)} invertidos en 7 días`, peso: c.sem.inv_7d });
    }
    if (/Ritmo (alto|bajo)/.test(c.dia.motivo)) {
      out.push({ clave: `ritmo:${id}`, ad_account_id: id, prioridad: 'Revisar', tipo: 'Presupuesto', origen: 'Regla automática', creativa: false,
        accion: /alto/.test(c.dia.motivo) ? 'Revisar el ritmo: gasta más rápido de lo esperado.' : 'Revisar el ritmo: gasta menos de lo esperado.',
        porque: c.dia.motivo, impacto: /alto/.test(c.dia.motivo) ? 'Evita agotar el presupuesto antes de tiempo' : 'Evita subejecutar el presupuesto', peso: c.dia.inversion });
    }
  }
  const cuentasActivas = new Set(cuentas.filter((c) => c.cfg.activa).map((c) => c.cfg.ad_account_id));
  const monedaDe = new Map(cuentas.map((c) => [c.cfg.ad_account_id, c.moneda]));
  for (const a of creativos.filter((x) => x.activo && cuentasActivas.has(x.ad_account_id))) {
    const d = (v: number) => dinero(v, monedaDe.get(a.ad_account_id) ?? null);
    if (a.estado === 'Pausar') {
      out.push({ clave: `pausar:${a.ad_id}`, ad_account_id: a.ad_account_id, ad_id: a.ad_id, prioridad: 'Urgente', tipo: 'Pausar', origen: 'Regla automática', creativa: true,
        accion: `Pausar "${a.nombre}".`, porque: a.resultados ? `CPL ${d(a.cpr!)} con ${a.resultados} resultados; el máximo es ${a.cpl_maximo != null ? d(a.cpl_maximo) : '–'}.` : `${d(a.inversion)} invertidos sin resultados.`,
        impacto: `Ahorra ~${d(a.inversion / Math.max(1, Math.min(14, a.dias)) * 7)}/semana`, peso: a.inversion });
    } else if (a.estado === 'Fatiga') {
      out.push({ clave: `fatiga:${a.ad_id}`, ad_account_id: a.ad_account_id, ad_id: a.ad_id, prioridad: 'Revisar', tipo: 'Fatiga', origen: 'Regla automática', creativa: true,
        accion: `Preparar un reemplazo de "${a.nombre}".`, porque: a.lectura, impacto: `Sostener ${Math.round(a.share)}% del gasto de la cuenta`, peso: a.inversion });
    } else if (a.estado === 'Ganador' && a.resultados >= 10 && a.cpl_objetivo != null && a.cpr != null && a.cpr <= a.cpl_objetivo * 0.8 && (a.frecuencia ?? 0) < 2.5) {
      out.push({ clave: `escalar:${a.ad_id}`, ad_account_id: a.ad_account_id, ad_id: a.ad_id, prioridad: 'Oportunidad', tipo: 'Escalar', origen: 'Regla automática', creativa: true,
        accion: `Subir 20% el presupuesto del conjunto "${a.conjunto}" (anuncio "${a.nombre}").`, porque: `CPL ${d(a.cpr)}, ${Math.round((1 - a.cpr / a.cpl_objetivo) * 100)}% bajo el objetivo, con ${a.resultados} resultados y frecuencia ${a.frecuencia != null ? a.frecuencia.toFixed(1) : '–'}.`,
        impacto: `≈ +${Math.max(1, Math.round(a.resultados / Math.max(1, Math.min(14, a.dias)) * 7 * 0.2))} resultados/semana`, peso: a.inversion });
    }
  }
  // Concentración: un anuncio con más de la mitad del gasto de su cuenta.
  for (const id of cuentasActivas) {
    const deCuenta = creativos.filter((a) => a.ad_account_id === id && a.inversion > 0);
    const top = deCuenta[0];
    if (deCuenta.length >= 2 && top && top.share >= 50) {
      out.push({ clave: `concentracion:${top.ad_id}`, ad_account_id: id, ad_id: top.ad_id, prioridad: 'Revisar', tipo: 'Concentración', origen: 'Regla automática', creativa: true,
        accion: `Sumar variantes: "${top.nombre}" concentra el ${Math.round(top.share)}% del gasto.`, porque: 'Si se fatiga o lo rechazan, la cuenta pierde volumen de golpe.', impacto: 'Menos riesgo de caída de entrega', peso: top.inversion / 2 });
    }
    // Redistribuir entre conjuntos activos con volumen comparable.
    const sets = conjuntos.filter((s) => s.ad_account_id === id && s.activo && s.share >= 10 && s.resultados >= 5 && s.cpr != null);
    if (sets.length >= 2) {
      const mejor = sets.reduce((a, b) => (b.cpr! < a.cpr! ? b : a)), peor = sets.reduce((a, b) => (b.cpr! > a.cpr! ? b : a));
      if (peor.cpr! / mejor.cpr! >= 1.8) {
        const d = (v: number) => dinero(v, monedaDe.get(id) ?? null);
        out.push({ clave: `redistribuir:${peor.id}:${mejor.id}`, ad_account_id: id, prioridad: 'Oportunidad', tipo: 'Redistribuir', origen: 'Regla automática', creativa: false,
          accion: `Mover presupuesto del conjunto "${peor.nombre}" a "${mejor.nombre}".`, porque: `CPL ${d(mejor.cpr!)} contra ${d(peor.cpr!)} (${(peor.cpr! / mejor.cpr!).toFixed(1)} veces más caro).`,
          impacto: 'Más resultados con la misma inversión', peso: peor.inversion });
      }
    }
    for (const s of conjuntos.filter((x) => x.ad_account_id === id && x.activo && x.aprendizaje === 'FAIL')) {
      out.push({ clave: `aprendizaje:${s.id}`, ad_account_id: id, prioridad: 'Revisar', tipo: 'Estructura', origen: 'Regla automática', creativa: false,
        accion: `Sacar de aprendizaje limitado al conjunto "${s.nombre}": unificar con otro o ampliar la audiencia.`, porque: `${s.resultados} resultados en el período: no alcanza el volumen que Meta necesita para optimizar.`,
        impacto: 'Entrega más estable y CPL más bajo', peso: s.inversion / 3 });
    }
  }
  // Briefs del AM (análisis "versión Paid Media"): uno por cliente, en su primera cuenta del PM.
  for (const b of briefs) {
    const c = cuentas.find((x) => x.cfg.client_id === b.client_id && x.cfg.activa);
    if (!c) continue;
    out.push({ clave: `brief:${b.carga_id}`, ad_account_id: c.cfg.ad_account_id, prioridad: 'Revisar', tipo: 'Brief del AM', origen: 'Brief del AM', creativa: false,
      accion: `Leer el análisis "versión Paid Media" del ${b.fecha.slice(8, 10)}/${b.fecha.slice(5, 7)} y aplicar lo que corresponda.`, porque: 'Incluye recomendaciones por anuncio a partir de las ventas del CRM.', impacto: 'Alinear las campañas con lo que vende', peso: 0 });
  }
  return out.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || b.peso - a.peso);
}

export interface EstadoReco { clave: string; estado: 'hecho' | 'pospuesta' | 'descartada'; hasta: string }

/** Una reco tratada no vuelve hasta su fecha: hecho 7 días, pospuesta 1, descartada 30. */
export function hastaPara(estado: EstadoReco['estado'], hoy: string): string {
  const dias = estado === 'hecho' ? 7 : estado === 'pospuesta' ? 1 : 30;
  return new Date(Date.parse(hoy + 'T00:00:00Z') + dias * 864e5).toISOString().slice(0, 10);
}

export function vigente(estados: EstadoReco[], hoy: string): Map<string, EstadoReco> {
  return new Map(estados.filter((e) => e.hasta > hoy).map((e) => [e.clave, e]));
}
