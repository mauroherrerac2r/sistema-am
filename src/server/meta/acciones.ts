// Traduce la respuesta de insights de Meta a las métricas que usa el sistema.

export interface Accion { action_type: string; value: string }

export const ACCION = {
  conversacion: 'onsite_conversion.messaging_conversation_started_7d',
  pedido: 'onsite_conversion.messaging_order_created_v2',
  // "lead" ya agrupa formularios instantáneos y lead de píxel; si no viene, se usa el agrupado on-site.
  lead: ['lead', 'onsite_conversion.lead_grouped'],
} as const;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function valorAccion(acciones: Accion[] | undefined, tipo: string): number {
  const a = (acciones || []).find((x) => x.action_type === tipo);
  return a ? num(a.value) : 0;
}

export function leads(acciones: Accion[] | undefined): number {
  for (const t of ACCION.lead) {
    const v = valorAccion(acciones, t);
    if (v > 0) return v;
  }
  return 0;
}

export interface FilaInsight {
  nivel: 'account' | 'ad';
  objeto_id: string;
  ad_account_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  fecha: string;
  inversion: number;
  impresiones: number;
  alcance: number | null;
  frecuencia: number | null;
  clics_enlace: number;
  leads: number;
  conversaciones: number;
  pedidos: number;
  acciones: Accion[] | null;
}

export function aFila(nivel: 'account' | 'ad', accountId: string, r: any): FilaInsight {
  const acciones: Accion[] | undefined = r.actions;
  return {
    nivel,
    objeto_id: nivel === 'account' ? accountId : String(r.ad_id),
    ad_account_id: accountId,
    campaign_id: r.campaign_id ? String(r.campaign_id) : null,
    adset_id: r.adset_id ? String(r.adset_id) : null,
    fecha: r.date_start,
    inversion: num(r.spend),
    impresiones: Math.round(num(r.impressions)),
    alcance: r.reach != null ? Math.round(num(r.reach)) : null,
    frecuencia: r.frequency != null ? num(r.frequency) : null,
    clics_enlace: Math.round(num(r.inline_link_clicks)),
    leads: Math.round(leads(acciones)),
    conversaciones: Math.round(valorAccion(acciones, ACCION.conversacion)),
    pedidos: Math.round(valorAccion(acciones, ACCION.pedido)),
    acciones: acciones ?? null,
  };
}
