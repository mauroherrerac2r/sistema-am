// Lógica de sincronización Meta -> base. Sin dependencias de Netlify ni Supabase,
// para poder probarla con datos simulados.
import { MetaClient } from './client.js';
import { aFila, FilaInsight } from './acciones.js';

export interface CuentaMeta {
  id: string;
  nombre: string;
  moneda: string | null;
  zona_horaria: string | null;
  estado_cuenta: number | null;
  motivo_deshabilitada: number | null;
  gasto_historico: number | null;
  tiene_pago: boolean | null;
}

const CAMPOS_INSIGHTS = [
  'ad_id', 'adset_id', 'campaign_id', 'spend', 'impressions', 'reach', 'frequency',
  'inline_link_clicks', 'actions',
].join(',');

export async function identidad(meta: MetaClient) {
  return meta.get<{ id: string; name: string }>('me', { fields: 'id,name' });
}

export async function cuentasDelToken(meta: MetaClient): Promise<CuentaMeta[]> {
  const rows = await meta.getAll<any>('me/adaccounts', {
    fields: 'account_id,name,currency,timezone_name,account_status,disable_reason,amount_spent,funding_source',
    limit: 200,
  });
  return rows.map((a) => ({
    id: String(a.account_id),
    nombre: a.name,
    moneda: a.currency ?? null,
    zona_horaria: a.timezone_name ?? null,
    estado_cuenta: a.account_status ?? null,
    motivo_deshabilitada: a.disable_reason ?? null,
    // amount_spent viene en centavos
    gasto_historico: a.amount_spent != null ? Number(a.amount_spent) / 100 : null,
    // Meta omite funding_source tanto si no hay método de pago como si el permiso no alcanza:
    // solo se afirma cuando viene. Los problemas de pago se alertan por account_status (3 = pago pendiente).
    tiene_pago: a.funding_source ? true : null,
  }));
}

export interface Rango { since: string; until: string }

export async function insightsCuenta(meta: MetaClient, accountId: string, rango: Rango): Promise<FilaInsight[]> {
  const comunes = { time_range: rango, time_increment: 1, limit: 500 };
  const [cuenta, anuncios] = await Promise.all([
    meta.getAll<any>(`act_${accountId}/insights`, { ...comunes, level: 'account', fields: CAMPOS_INSIGHTS.replace('ad_id,adset_id,campaign_id,', '') }),
    meta.getAll<any>(`act_${accountId}/insights`, { ...comunes, level: 'ad', fields: CAMPOS_INSIGHTS }),
  ]);
  return [...cuenta.map((r) => aFila('account', accountId, r)), ...anuncios.map((r) => aFila('ad', accountId, r))];
}

/** Alcance y frecuencia de los 7 días cerrados, por anuncio (un solo número por período). */
export async function frecuencia7d(meta: MetaClient, accountId: string, rango: Rango) {
  const rows = await meta.getAll<any>(`act_${accountId}/insights`, { level: 'ad', time_range: rango, fields: 'ad_id,reach,frequency', limit: 500 });
  return rows.map((r) => ({ ad_id: String(r.ad_id), ad_account_id: accountId, hasta: rango.until, alcance: r.reach != null ? Math.round(Number(r.reach)) : null, frecuencia: r.frequency != null ? Number(r.frequency) : null }));
}

export async function estructuraCuenta(meta: MetaClient, accountId: string) {
  const [campanas, conjuntos, anuncios] = await Promise.all([
    meta.getAll<any>(`act_${accountId}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget', limit: 500 }),
    meta.getAll<any>(`act_${accountId}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,learning_stage_info,destination_type,optimization_goal', limit: 500 }),
    meta.getAll<any>(`act_${accountId}/ads`, { fields: 'id,name,campaign_id,adset_id,status,effective_status,created_time', limit: 500 }),
  ]);
  const cent = (v: any) => (v != null ? Number(v) / 100 : null);
  return {
    campaigns: campanas.map((c) => ({ id: c.id, ad_account_id: accountId, nombre: c.name, objetivo: c.objective ?? null, estado: c.status ?? null, estado_efectivo: c.effective_status ?? null, presupuesto_diario: cent(c.daily_budget) })),
    adsets: conjuntos.map((s) => ({ id: s.id, ad_account_id: accountId, campaign_id: s.campaign_id ?? null, nombre: s.name, estado: s.status ?? null, estado_efectivo: s.effective_status ?? null, presupuesto_diario: cent(s.daily_budget), aprendizaje: s.learning_stage_info?.status ?? null, destino: s.destination_type ?? null, optimizacion: s.optimization_goal ?? null })),
    ads: anuncios.map((a) => ({ id: a.id, ad_account_id: accountId, campaign_id: a.campaign_id ?? null, adset_id: a.adset_id ?? null, nombre: a.name, estado: a.status ?? null, estado_efectivo: a.effective_status ?? null, creado_meta: a.created_time ?? null })),
  };
}

export { fechaEnZona } from '../../shared/fechas.js';

/** Ejecuta tareas con concurrencia limitada y junta resultados y errores sin cortar. */
export async function enParalelo<T, R>(items: T[], limite: number, fn: (x: T) => Promise<R>) {
  const ok: { item: T; res: R }[] = [];
  const err: { item: T; error: string }[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try { ok.push({ item, res: await fn(item) }); }
      catch (e: any) { err.push({ item, error: e?.message || String(e) }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return { ok, err };
}
