import { describe, it, expect } from 'vitest';
import { evaluarDia, evaluarSemana, totalCliente, veredicto, canalAnuncio, resultado, armarAnuncios, resumir, lectura, observacionConjunto, CfgCuenta, CuentaMeta, Dia } from '../src/web/reglas';
import { horaEnZona, sumarDias } from '../src/shared/fechas';

const cfg = (x: Partial<CfgCuenta> = {}): CfgCuenta => ({ ad_account_id: '1', client_id: 'c', sede: null, canales: ['WhatsApp'], presupuesto_semanal: 700, cpl_objetivo: 5, cpl_maximo: 8, activa: true, nota: null, ...x });
const meta = (x: Partial<CuentaMeta> = {}): CuentaMeta => ({ id: '1', nombre: 'Cuenta', moneda: 'USD', zona_horaria: 'UTC', estado_cuenta: 1, bm_id: 'bm', ...x });
const dia = (fecha: string, x: Partial<Dia> = {}): Dia => ({ ad_account_id: '1', fecha, inversion: 100, impresiones: 10000, clics_enlace: 100, leads: 0, conversaciones: 25, pedidos: 0, ...x });
const semana = (corte: string, x: Partial<Dia> = {}, dias = 14) => Array.from({ length: dias }, (_, i) => dia(sumarDias(corte, -i), x));

describe('resultado por canal', () => {
  it('formulario cuenta leads, mensajería conversaciones, ambos suman', () => {
    const d = { leads: 3, conversaciones: 10 };
    expect(resultado(d, ['Formulario'])).toBe(3);
    expect(resultado(d, ['WhatsApp'])).toBe(10);
    expect(resultado(d, ['Formulario', 'Messenger'])).toBe(13);
    expect(resultado(d, [])).toBe(10);
  });
});

describe('operación del día', () => {
  it('sin entrega a media mañana es crítico; muy temprano no', () => {
    expect(evaluarDia(cfg(), undefined, 10, false).nivel).toBe('critico');
    expect(evaluarDia(cfg(), undefined, 3, false).nivel).toBe('sin');
  });
  it('ritmo: 100 de presupuesto diario a las 12 h → esperado 50', () => {
    const e = evaluarDia(cfg(), dia('2026-11-18', { inversion: 50 }), 12, false);
    expect(e.ritmo_pct).toBeCloseTo(100);
    expect(e.nivel).toBe('ok');
    expect(evaluarDia(cfg(), dia('x', { inversion: 20 }), 12, false).motivo).toMatch(/Ritmo bajo/);
  });
  it('CPL sobre el máximo solo alerta con 3+ resultados', () => {
    expect(evaluarDia(cfg(), dia('x', { inversion: 50, conversaciones: 2 }), 12, false).nivel).toBe('ok');
    const e = evaluarDia(cfg(), dia('x', { inversion: 50, conversaciones: 5 }), 12, false);
    expect(e.cpr).toBe(10);
    expect(e.nivel).toBe('atencion');
  });
  it('gastó 2 CPL máximos sin resultados → crítico', () => {
    expect(evaluarDia(cfg(), dia('x', { inversion: 20, conversaciones: 0 }), 12, false).nivel).toBe('critico');
  });
  it('ayer usa día completo y rangos 80–120', () => {
    const e = evaluarDia(cfg(), dia('x', { inversion: 75, conversaciones: 20 }), null, true);
    expect(e.ritmo_pct).toBe(75);
    expect(e.motivo).toMatch(/Ritmo bajo/);
  });
  it('inactiva no alerta', () => {
    expect(evaluarDia(cfg({ activa: false }), undefined, 20, false).nivel).toBe('inactiva');
  });
});

describe('últimos 7 días', () => {
  const corte = '2026-11-17';
  it('en rango → OK', () => {
    const s = evaluarSemana(cfg(), meta(), semana(corte), corte);
    expect(s.inv_7d).toBe(700);
    expect(s.pacing_pct).toBe(100);
    expect(s.cpr_7d).toBe(4);
    expect(s.nivel).toBe('ok');
  });
  it('CPL entre objetivo y máximo → atención; sobre máximo → crítico', () => {
    expect(evaluarSemana(cfg(), meta(), semana(corte, { conversaciones: 16 }), corte).nivel).toBe('atencion');
    expect(evaluarSemana(cfg(), meta(), semana(corte, { conversaciones: 10 }), corte).nivel).toBe('critico');
  });
  it('pacing fuera de 80–120 → crítico', () => {
    const s = evaluarSemana(cfg(), meta(), semana(corte, { inversion: 70, conversaciones: 20 }), corte);
    expect(Math.round(s.pacing_pct!)).toBe(70);
    expect(s.nivel).toBe('critico');
  });
  it('cuenta deshabilitada o sin BM', () => {
    expect(evaluarSemana(cfg(), meta({ estado_cuenta: 2 }), semana(corte), corte).motivo).toMatch(/deshabilitada/);
    expect(evaluarSemana(cfg(), undefined, semana(corte), corte).nivel).toBe('info');
  });
  it('dejó de invertir esta semana', () => {
    const filas = semana(corte).map((d) => (d.fecha > sumarDias(corte, -7) ? { ...d, inversion: 0, conversaciones: 0 } : d));
    expect(evaluarSemana(cfg(), meta(), filas, corte).motivo).toBe('Dejó de invertir esta semana');
  });
  it('variación de CPL vs semana previa', () => {
    const filas = semana(corte).map((d) => (d.fecha <= sumarDias(corte, -7) ? { ...d, conversaciones: 50 } : d));
    expect(evaluarSemana(cfg(), meta(), filas, corte).cpr_var_pct).toBeCloseTo(100);
  });
  it('total del cliente pondera objetivo por presupuesto', () => {
    const a = { cfg: cfg({ presupuesto_semanal: 700, cpl_objetivo: 5 }), sem: evaluarSemana(cfg(), meta(), semana(corte), corte), nombre: 'A' };
    const b = { cfg: cfg({ ad_account_id: '2', presupuesto_semanal: 300, cpl_objetivo: 10 }), sem: { ...a.sem, nivel: 'critico' as const, motivo: 'x' }, nombre: 'B' };
    const t = totalCliente([a, b]);
    expect(t.cpl_objetivo).toBeCloseTo(1000 / (140 + 30));
    expect(t.nivel).toBe('critico');
    expect(t.motivo).toBe('B: x');
  });
});

describe('anuncios', () => {
  it('veredicto', () => {
    expect(veredicto(40, 10, 5, 8)).toBe('Ganador');
    expect(veredicto(60, 10, 5, 8)).toBe('Atención');
    expect(veredicto(100, 10, 5, 8)).toBe('Pausar');
    expect(veredicto(30, 3, 5, 8)).toBe('Pausar');
    expect(veredicto(27, 2, 5, 8)).toBe('Observar');
    expect(veredicto(16, 0, 5, 8)).toBe('Pausar');
    expect(veredicto(10, 0, 5, 8)).toBe('Poco dato');
  });
  it('canal por destino del conjunto, con respaldo en la campaña', () => {
    expect(canalAnuncio('WHATSAPP', null, 'cualquier')).toBe('WhatsApp');
    expect(canalAnuncio('ON_AD', null, '')).toBe('Formulario');
    expect(canalAnuncio(null, 'OUTCOME_LEADS', '')).toBe('Formulario');
    expect(canalAnuncio(null, 'OUTCOME_ENGAGEMENT', 'NSG | MESS | Palacios')).toBe('Messenger');
    expect(canalAnuncio(null, null, 'CTWA promo')).toBe('WhatsApp');
  });
  it('arma, resume y lee', () => {
    const base = { ad_account_id: '1', campana: 'C', conjunto: 'S', estado: 'ACTIVE', impresiones: 1000, alcance: 0, clics_enlace: 10, frecuencia: 1.2, leads: 0, pedidos: 0 };
    const ads = armarAnuncios([
      { ...base, ad_id: 'a', anuncio: 'A', canal: 'WhatsApp', inversion: 60, conversaciones: 15 },
      { ...base, ad_id: 'b', anuncio: 'B', canal: 'WhatsApp', inversion: 30, conversaciones: 3 },
      { ...base, ad_id: 'c', anuncio: 'C', canal: 'WhatsApp', inversion: 20, conversaciones: 0, estado: 'PAUSED' },
    ], new Map([['1', cfg()]]));
    expect(ads[0].share_total).toBeCloseTo(60 / 110 * 100);
    expect(ads.map((a) => a.veredicto)).toEqual(['Ganador', 'Pausar', 'Pausar']);
    const r = resumir(ads);
    expect(r.cpr).toBeCloseTo(110 / 18);
    const l = lectura(ads, r, (v) => '$' + v.toFixed(2), false);
    expect(l[0]).toMatch(/sobre el objetivo pero dentro del máximo/);
    expect(l.some((t) => /concentra/.test(t))).toBe(true);
    expect(l.some((t) => /hoy no están activos/.test(t))).toBe(true);
  });
  it('observaciones de conjuntos', () => {
    expect(observacionConjunto('ACTIVE', 'FAIL')).toEqual({ texto: 'Aprendizaje limitado', grave: true });
    expect(observacionConjunto('ACTIVE', 'SUCCESS')).toBeNull();
    expect(observacionConjunto('WITH_ISSUES', 'LEARNING')?.texto).toBe('Con problemas · En aprendizaje');
  });
  it('hora en zona', () => {
    expect(horaEnZona('America/Argentina/Buenos_Aires', new Date('2026-11-18T15:30:00Z'))).toBe(12.5);
  });
});
