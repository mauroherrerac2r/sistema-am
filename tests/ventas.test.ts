import { describe, it, expect } from 'vitest';
import { leerVentas, cruzar, agrupar, total, hallazgos, AnuncioMeta } from '../src/web/ventas';

const CSV = `product,source_ad_id,ad_id,Pre-Leads,Leads,Ordenes,Monto total,Por Cobrar,Cobrado
Palacios,120250874232790661,https://fb.me/4G7JZovAx,248,247,4,950,950,0
Palacios,120250874232790661,https://fb.me/bLeUjkE2x,2,2,1,120,120,0
Palacios,120250874498110661,https://fb.me/5klOGgfoi,155,154,8,1559,1559,0
Roosevelt,120251698198790737,https://fb.me/2biUSWVCJ0,69,69,0,,,
Pelaez,120248976994080426,https://fb.me/6mcU0FEaV,83,83,0,,,
Pelaez,,sin-id,1,1,0,,,`;

describe('lectura del export de PicallEx', () => {
  it('suma los enlaces de un mismo anuncio y descarta filas sin ID', () => {
    const l = leerVentas(CSV);
    expect(l.filas).toHaveLength(4);
    expect(l.descartadas).toBe(1);
    const a = l.filas.find((f) => f.ad_id === '120250874232790661')!;
    expect(a).toMatchObject({ leads: 249, ordenes: 5, monto: 1070, por_cobrar: 1070, cobrado: 0, enlaces: 2, sede_crm: 'Palacios' });
  });
  it('reconoce otros nombres de columna y el pegado con tabs', () => {
    const l = leerVentas('Sede\tID del anuncio\tLeads\tVentas\tMonto\nCentro\t123456789\t10\t2\t300,50');
    expect(l.filas[0]).toMatchObject({ ad_id: '123456789', leads: 10, ordenes: 2, monto: 300.5 });
  });
  it('avisa si falta el ID de anuncio', () => {
    expect(() => leerVentas('Fecha,Monto\n1/11,100')).toThrow(/ID del anuncio/);
  });
});

describe('cruce con Meta', () => {
  const meta: AnuncioMeta[] = [
    { ad_id: '120250874232790661', ad_account_id: 'A', anuncio: 'A1', campana: 'C1', conjunto: 'S1', estado: 'ACTIVE', canal: 'WhatsApp', inversion: 500, resultados: 260 },
    { ad_id: '120250874498110661', ad_account_id: 'A', anuncio: 'A2', campana: 'C1', conjunto: 'S2', estado: 'ACTIVE', canal: 'WhatsApp', inversion: 300, resultados: 150 },
    { ad_id: '120251698198790737', ad_account_id: 'R', anuncio: 'R1', campana: 'C2', conjunto: 'S3', estado: 'ACTIVE', canal: 'WhatsApp', inversion: 400, resultados: 80 },
    { ad_id: '999', ad_account_id: 'R', anuncio: 'R2', campana: 'C2', conjunto: 'S4', estado: 'PAUSED', canal: 'WhatsApp', inversion: 900, resultados: 10 },
  ];
  const sede = (c: string) => (c === 'A' ? 'Palacios' : 'Roosevelt');
  const filas = cruzar(meta, leerVentas(CSV).filas, sede);

  it('calcula ROAS, costo por orden y cierre por anuncio', () => {
    const a2 = filas.find((f) => f.ad_id === '120250874498110661')!;
    expect(a2.roas).toBeCloseTo(1559 / 300);
    expect(a2.costo_orden).toBeCloseTo(300 / 8);
    expect(a2.cierre_pct).toBeCloseTo((8 / 154) * 100);
  });
  it('incluye anuncios del CRM sin gasto en el período', () => {
    const fuera = filas.find((f) => f.ad_id === '120248976994080426')!;
    expect(fuera.en_meta).toBe(false);
    expect(fuera.sede).toBe('Pelaez · sin gasto en el período');
    expect(fuera.costo_orden).toBeNull();
  });
  it('totales y grupos por sede', () => {
    const t = total(filas);
    expect(t.inversion).toBe(2100);
    expect(t.monto).toBe(2629);
    expect(t.ordenes).toBe(13);
    const sedes = agrupar(filas, (f) => f.sede);
    expect(sedes.find((s) => s.clave === 'Roosevelt')).toMatchObject({ inversion: 1300, ordenes: 0, leads_crm: 69 });
  });
  it('hallazgos: escalar, gasto sin ventas y ventas por cobrar', () => {
    const h = hallazgos(filas, agrupar(filas, (f) => f.sede), (v) => '$' + v.toFixed(0));
    const textos = h.map((x) => x.texto).join('\n');
    expect(textos).toMatch(/A2 \(Palacios\).*Candidato a escalar/);
    expect(textos).toMatch(/gastaron más de 1,5 veces/);
    expect(textos).toMatch(/por cobrar/);
  });
});
