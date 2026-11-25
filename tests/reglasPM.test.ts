import { describe, it, expect } from 'vitest';
import { armarCreativos, armarConjuntos, generarRecos, hastaPara, vigente, AdDiario, AdInfo, AdsetInfo, CampanaInfo, CuentaPM } from '../src/web/reglasPM';
import { evaluarDia, evaluarSemana, CfgCuenta } from '../src/web/reglas';
import { sumarDias } from '../src/shared/fechas';

const hoy = '2026-11-24';
const fechas = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, -13 + i));
const cfg: CfgCuenta = { ad_account_id: 'A', client_id: 'c', sede: null, canales: ['WhatsApp'], presupuesto_semanal: 700, cpl_objetivo: 5, cpl_maximo: 8, activa: true, nota: null, pm_id: 'p1' };
const dia = (ad: string, set: string, f: string, x: Partial<AdDiario>): AdDiario => ({ ad_id: ad, ad_account_id: 'A', adset_id: set, campaign_id: 'k', fecha: f, inversion: 10, impresiones: 2000, clics_enlace: 40, leads: 0, conversaciones: 5, ...x });

const diarios: AdDiario[] = [
  // Ganador: CPL 2 (10/5), estable
  ...fechas.map((f) => dia('gan', 's1', f, {})),
  // Pausar: gasta sin resultados
  ...fechas.slice(-3).map((f) => dia('mal', 's2', f, { inversion: 8, conversaciones: 0 })),
  // Fatiga: CTR cae de 2% a 1%
  ...fechas.map((f, i) => dia('fat', 's3', f, { clics_enlace: i < 7 ? 40 : 20, conversaciones: 2, inversion: 8 })),
];
const ads = new Map<string, AdInfo>(['gan', 'mal', 'fat'].map((id) => [id, { id, nombre: 'Anuncio ' + id, estado_efectivo: 'ACTIVE', miniatura: null, formato: 'VIDEO', creado_meta: fechas[0] + 'T00:00:00Z', adset_id: null, campaign_id: null }]));
const adsets = new Map<string, AdsetInfo>([
  ['s1', { id: 's1', ad_account_id: 'A', campaign_id: 'k', nombre: 'Lookalike', estado_efectivo: 'ACTIVE', presupuesto_diario: 10, aprendizaje: 'SUCCESS', destino: 'WHATSAPP' }],
  ['s2', { id: 's2', ad_account_id: 'A', campaign_id: 'k', nombre: 'Intereses', estado_efectivo: 'ACTIVE', presupuesto_diario: 10, aprendizaje: 'FAIL', destino: 'WHATSAPP' }],
  ['s3', { id: 's3', ad_account_id: 'A', campaign_id: 'k', nombre: 'Amplio', estado_efectivo: 'ACTIVE', presupuesto_diario: 10, aprendizaje: 'SUCCESS', destino: 'WHATSAPP' }],
]);
const campanas = new Map<string, CampanaInfo>([['k', { id: 'k', nombre: 'NSG | WAPP', objetivo: 'OUTCOME_ENGAGEMENT', presupuesto_diario: null, estado_efectivo: 'ACTIVE' }]]);
const creativos = armarCreativos(diarios, ads, adsets, campanas, new Map([['A', cfg]]), new Map([['gan', 1.4], ['fat', 2.1]]), fechas, hoy);

describe('creativos', () => {
  it('estado de cada anuncio', () => {
    const e = Object.fromEntries(creativos.map((c) => [c.ad_id, c.estado]));
    expect(e).toEqual({ gan: 'Ganador', mal: 'Pausar', fat: 'Fatiga' });
  });
  it('caída de CTR y formato', () => {
    const f = creativos.find((c) => c.ad_id === 'fat')!;
    expect(f.caidaCtr).toBeCloseTo(-50);
    expect(f.formato).toBe('Video');
    expect(creativos.find((c) => c.ad_id === 'gan')!.cpr).toBe(2);
  });
});

describe('umbral de pausa del PM', () => {
  it('CPL apenas sobre el máximo queda en Observar; 20% arriba, Pausar', () => {
    const mk = (conv: number) => armarCreativos(fechas.map((f) => dia('x', 's1', f, { inversion: 30, conversaciones: conv })), ads, adsets, campanas, new Map([['A', cfg]]), new Map(), fechas, hoy)[0].estado;
    expect(mk(3.6)).toBe('Observar');   // CPL ≈ 8,3 con máximo 8
    expect(mk(3)).toBe('Pausar');       // CPL 10, 25% sobre el máximo
  });
});

describe('recomendaciones', () => {
  const conjuntos = armarConjuntos(creativos, adsets, campanas);
  const cuenta: CuentaPM = { cfg, meta: { id: 'A', nombre: 'Cuenta A', moneda: 'USD', zona_horaria: 'UTC', estado_cuenta: 1, bm_id: 'b' }, nombre: 'Cuenta A', moneda: 'USD',
    dia: evaluarDia(cfg, { ad_account_id: 'A', fecha: hoy, inversion: 90, impresiones: 1, clics_enlace: 1, leads: 0, conversaciones: 20, pedidos: 0 }, 12, false),
    sem: evaluarSemana(cfg, { id: 'A', nombre: 'A', moneda: 'USD', zona_horaria: 'UTC', estado_cuenta: 1, bm_id: 'b' }, fechas.map((f) => ({ ad_account_id: 'A', fecha: f, inversion: 100, impresiones: 1, clics_enlace: 1, leads: 0, conversaciones: 30, pedidos: 0 })), sumarDias(hoy, -1)) };
  const recos = generarRecos([cuenta], creativos, conjuntos, [{ client_id: 'c', fecha: '2026-11-24T10:00:00Z', carga_id: 'k1' }], (v) => '$' + v.toFixed(2));
  const tipos = recos.map((r) => r.tipo);
  it('genera pausar, escalar, fatiga, aprendizaje, ritmo y brief', () => {
    expect(tipos).toEqual(expect.arrayContaining(['Pausar', 'Escalar', 'Fatiga', 'Estructura', 'Presupuesto', 'Brief del AM']));
  });
  it('urgentes primero', () => {
    expect(recos[0].prioridad).toBe('Urgente');
    expect(recos.findIndex((r) => r.prioridad === 'Revisar')).toBeGreaterThan(recos.findIndex((r) => r.prioridad === 'Oportunidad'));
  });
  it('cuenta con pago pendiente es urgente', () => {
    const r = generarRecos([{ ...cuenta, meta: { ...cuenta.meta!, estado_cuenta: 3 } }], [], [], [], (v) => String(v));
    expect(r[0]).toMatchObject({ prioridad: 'Urgente', tipo: 'Entrega' });
  });
  it('estado de recos: vence según la acción', () => {
    expect(hastaPara('pospuesta', hoy)).toBe('2026-11-25');
    expect(hastaPara('hecho', hoy)).toBe('2026-12-01');
    expect(vigente([{ clave: 'x', estado: 'pospuesta', hasta: '2026-11-24' }], hoy).size).toBe(0);
  });
});
