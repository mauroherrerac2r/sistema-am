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
    fields: 'account_id,name,currency,timezone_name,account_status,disable_reason,amount_spent',
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

export async function estructuraCuenta(meta: MetaClient, accountId: string) {
  const [campanas, conjuntos, anuncios] = await Promise.all([
    meta.getAll<any>(`act_${accountId}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget', limit: 500 }),
    meta.getAll<any>(`act_${accountId}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,learning_stage_info', limit: 500 }),
    meta.getAll<any>(`act_${accountId}/ads`, { fields: 'id,name,campaign_id,adset_id,status,effective_status,created_time', limit: 500 }),
  ]);
  const cent = (v: any) => (v != null ? Number(v) / 100 : null);
  return {
    campaigns: campanas.map((c) => ({ id: c.id, ad_account_id: accountId, nombre: c.name, objetivo: c.objective ?? null, estado: c.status ?? null, estado_efectivo: c.effective_status ?? null, presupuesto_diario: cent(c.daily_budget) })),
    adsets: conjuntos.map((s) => ({ id: s.id, ad_account_id: accountId, campaign_id: s.campaign_id ?? null, nombre: s.name, estado: s.status ?? null, estado_efectivo: s.effective_status ?? null, presupuesto_diario: cent(s.daily_budget), aprendizaje: s.learning_stage_info?.status ?? null })),
    ads: anuncios.map((a) => ({ id: a.id, ad_account_id: accountId, campaign_id: a.campaign_id ?? null, adset_id: a.adset_id ?? null, nombre: a.name, estado: a.status ?? null, estado_efectivo: a.effective_status ?? null, creado_meta: a.created_time ?? null })),
  };
}

/** Fecha local (YYYY-MM-DD) en la zona de la cuenta, desplazada `dias` días. */
export function fechaEnZona(zona: string | null, dias = 0, ahora = new Date()): string {
  const d = new Date(ahora.getTime() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

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
