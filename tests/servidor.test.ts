import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { cifrar, descifrar } from '../src/server/crypto';
import { aFila, leads } from '../src/server/meta/acciones';
import { MetaClient, MetaError } from '../src/server/meta/client';
import { insightsCuenta, fechaEnZona, enParalelo } from '../src/server/meta/sync';
import { leerConfig, numero, canales } from '../src/server/config-csv';

const resp = (body: any, status = 200) => new Response(JSON.stringify(body), { status });

describe('cifrado de tokens', () => {
  it('ida y vuelta, y falla con otra clave', () => {
    const k = randomBytes(32);
    const c = cifrar('EAAB-token-de-prueba', k);
    expect(c).not.toContain('EAAB');
    expect(descifrar(c, k)).toBe('EAAB-token-de-prueba');
    expect(() => descifrar(c, randomBytes(32))).toThrow();
  });
});

describe('métricas desde actions', () => {
  const r = {
    ad_id: '9', adset_id: '8', campaign_id: '7', date_start: '2026-11-10', spend: '1234.5', impressions: '1000', reach: '800',
    frequency: '1.25', inline_link_clicks: '40',
    actions: [
      { action_type: 'lead', value: '12' }, { action_type: 'onsite_conversion.lead_grouped', value: '12' },
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' },
      { action_type: 'onsite_conversion.messaging_order_created_v2', value: '2' },
    ],
  };
  it('no duplica leads y toma conversaciones y pedidos', () => {
    const f = aFila('ad', '111', r);
    expect(f).toMatchObject({ objeto_id: '9', inversion: 1234.5, leads: 12, conversaciones: 5, pedidos: 2, clics_enlace: 40, alcance: 800 });
  });
  it('usa lead_grouped si no viene lead', () => {
    expect(leads([{ action_type: 'onsite_conversion.lead_grouped', value: '3' }])).toBe(3);
  });
  it('nivel cuenta usa el id de la cuenta', () => {
    expect(aFila('account', '111', { ...r, ad_id: undefined }).objeto_id).toBe('111');
  });
});

describe('cliente de Meta', () => {
  it('pagina y reintenta ante límite de uso', async () => {
    const llamadas: string[] = [];
    let limiteDado = false;
    const fetch = async (url: string) => {
      llamadas.push(url);
      if (!limiteDado) { limiteDado = true; return resp({ error: { message: 'User request limit reached', code: 17 } }, 400); }
      const u = new URL(url);
      if (u.searchParams.get('after') === 'p2') return resp({ data: [{ date_start: '2026-11-11', spend: '2', ad_id: 'b' }] });
      return resp({ data: [{ date_start: '2026-11-10', spend: '1', ad_id: 'a' }], paging: { next: url + '&after=p2' } });
    };
    const meta = new MetaClient({ token: 't', fetch, esperar: async () => {} });
    const filas = await meta.getAll('act_1/insights', { level: 'ad' });
    expect(filas).toHaveLength(2);
    expect(llamadas).toHaveLength(3);
    expect(llamadas[0]).toContain('graph.facebook.com');
  });
  it('no reintenta un token vencido', async () => {
    let n = 0;
    const meta = new MetaClient({ token: 't', fetch: async () => { n++; return resp({ error: { message: 'Session expired', code: 190 } }, 400); }, esperar: async () => {} });
    const e = await meta.get('me').catch((x) => x);
    expect(e).toBeInstanceOf(MetaError);
    expect(e.esToken).toBe(true);
    expect(n).toBe(1);
  });
  it('insightsCuenta pide nivel cuenta y anuncio con el rango', async () => {
    const urls: string[] = [];
    const meta = new MetaClient({ token: 't', fetch: async (u: string) => { urls.push(u); return resp({ data: [{ date_start: '2026-11-10', spend: '10', ad_id: 'x', actions: [] }] }); } });
    const filas = await insightsCuenta(meta, '555', { since: '2026-11-01', until: '2026-11-10' });
    expect(filas.map((f) => f.nivel).sort()).toEqual(['account', 'ad']);
    const u = new URL(urls[0]);
    expect(u.pathname).toMatch(/act_555\/insights$/);
    expect(JSON.parse(u.searchParams.get('time_range')!)).toEqual({ since: '2026-11-01', until: '2026-11-10' });
    expect(u.searchParams.get('time_increment')).toBe('1');
  });
});

describe('utilidades', () => {
  it('fecha en la zona de la cuenta', () => {
    const ahora = new Date('2026-11-18T02:00:00Z');
    expect(fechaEnZona('America/Argentina/Buenos_Aires', 0, ahora)).toBe('2026-11-17');
    expect(fechaEnZona('UTC', 0, ahora)).toBe('2026-11-18');
    expect(fechaEnZona('America/Mexico_City', -1, ahora)).toBe('2026-11-16');
  });
  it('enParalelo junta errores sin cortar', async () => {
    const { ok, err } = await enParalelo([1, 2, 3, 4], 2, async (x) => { if (x === 3) throw new Error('falló'); return x * 2; });
    expect(ok.map((o) => o.res).sort()).toEqual([2, 4, 8]);
    expect(err).toEqual([{ item: 3, error: 'falló' }]);
  });
});

describe('CSV del Sheet', () => {
  const csv = '﻿Cliente,Sede,Cuenta publicitaria,ID cuenta publicitaria,Activa,Moneda,Presupuesto mensual,Presupuesto semanal,CPL objetivo,CPL máximo tolerable,Canal publicitario,Notas,AM\n' +
    'NEW SUNRISE GROUP,Palacios 2,NSG Palacios,act_1003766254011219,Sí,USD,,"1.500,00","3,50",5,WhatsApp y Formulario,,Mauro@x.com\n' +
    'KURADEL,,Kuradel,449635846641860,No,ARS,"300.000",,1200,"1.800",Messenger,"Pausada, vuelve en dic",\n';
  it('lee filas, números con coma y canales', () => {
    const f = leerConfig(csv);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ slug: 'new-sunrise-group', ad_account_id: '1003766254011219', activa: true, presupuesto_semanal: 1500, cpl_objetivo: 3.5, cpl_maximo: 5, canales: ['Formulario', 'WhatsApp'], am_email: 'mauro@x.com' });
    expect(f[1]).toMatchObject({ sede: null, activa: false, cpl_maximo: 1800, nota: 'Pausada, vuelve en dic' });
    expect(f[1].presupuesto_semanal).toBeCloseTo((300000 / 30.4) * 7, 0);
  });
  it('numero acepta formatos comunes', () => {
    expect(numero('$ 1.234,56')).toBe(1234.56);
    expect(numero('1234.56')).toBe(1234.56);
    expect(numero('1.500')).toBe(1500);
    expect(numero('')).toBeNull();
    expect(canales('Instagram Direct')).toEqual(['Instagram']);
  });
});
