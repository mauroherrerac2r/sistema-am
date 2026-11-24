// Gráficos interactivos del análisis de ventas. SVG propio: sin librerías, tooltips y clic.
// Colores por rol (ver estilos.css): --s1..--s3 categóricos validados para daltonismo, --o1..--o3 rampa ordinal.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FilaCruce, Grupo, Metricas } from './ventas';
import { entero, dec, pct } from './formato';

/** Ancho real del contenedor, para dibujar a la medida (escritorio y celular). */
function useAncho(min = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(min, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return { ref, ancho };
}

interface Tip { x: number; y: number; contenido: ReactNode }

function Tooltip({ tip, ancho }: { tip: Tip | null; ancho: number }) {
  if (!tip) return null;
  const izq = Math.min(Math.max(0, tip.x + 12), ancho - 220);
  return <div className="tip tip-libre" style={{ left: izq, top: Math.max(0, tip.y - 10) }}>{tip.contenido}</div>;
}

const fila = (k: string, v: string) => <div key={k}>{k} <b>{v}</b></div>;

/** Color fijo por sede (sigue a la sede aunque se filtre). Más de 3 sedes: el resto en gris "Otras". */
export function coloresSede(grupos: Grupo[]): Map<string, string> {
  const m = new Map<string, string>();
  grupos.forEach((g, i) => m.set(g.clave, i < 3 ? `var(--s${i + 1})` : 'var(--neutro)'));
  return m;
}

// ---------------- Retorno por sede ----------------

export function RetornoPorSede({ grupos, d, roasObjetivo, seleccion, alElegir }: {
  grupos: Grupo[]; d: (v: number | null) => string; roasObjetivo: number | null; seleccion: string | null; alElegir: (s: string | null) => void;
}) {
  const { ref, ancho } = useAncho();
  const [tip, setTip] = useState<Tip | null>(null);
  const filas = grupos.filter((g) => g.inversion > 0);
  const sinGasto = grupos.filter((g) => g.inversion === 0 && (g.monto > 0 || g.leads_crm > 0));
  if (!filas.length) return <p className="muted">Sin datos.</p>;
  const etiqueta = Math.min(170, Math.max(100, ancho * 0.28)), derecha = 92, chars = Math.floor(etiqueta / 7.2);
  const alto = 18 + filas.length * 50;
  const max = Math.max(...filas.map((g) => Math.max(g.inversion, g.monto))) || 1;
  const w = (v: number) => (v / max) * (ancho - etiqueta - derecha);
  return (
    <div className="grafico" ref={ref} onPointerLeave={() => setTip(null)}>
      <p className="leyenda"><span className="l-s1">Inversión Meta</span><span className="l-s2">Monto vendido</span><span className="muted">Tocá una sede para filtrar</span></p>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Inversión y monto vendido por sede, con su ROAS">
        {filas.map((g, i) => {
          const y = 10 + i * 50, apagada = seleccion != null && seleccion !== g.clave;
          const tono = g.roas == null ? '' : roasObjetivo != null ? (g.roas >= roasObjetivo ? 'bien' : g.roas >= 1 ? 'aviso' : 'mal') : g.roas >= 1 ? 'bien' : 'mal';
          return (
            <g key={g.clave} className={`clic ${apagada ? 'apagada' : ''}`} onClick={() => alElegir(seleccion === g.clave ? null : g.clave)}
              onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, contenido: <><b>{g.clave}</b>{fila('Inversión', d(g.inversion))}{fila('Monto vendido', d(g.monto))}{fila('ROAS', g.roas == null ? '–' : dec(g.roas))}{fila('Órdenes', entero(g.ordenes))}{fila('Costo por orden', d(g.costo_orden))}</> }); }}>
              <rect x={0} y={y - 4} width={ancho} height={46} fill="transparent" />
              <text x={etiqueta - 8} y={y + 19} textAnchor="end" className="eje">{g.clave.length > chars ? g.clave.slice(0, chars - 1) + '…' : g.clave}</text>
              <rect x={etiqueta} y={y} width={Math.max(2, w(g.inversion))} height={16} rx={4} className="m-s1" />
              <rect x={etiqueta} y={y + 18} width={Math.max(g.monto ? 2 : 0, w(g.monto))} height={16} rx={4} className="m-s2" />
              <text x={etiqueta + Math.max(w(g.inversion), w(g.monto)) + 8} y={y + 22} className={`valor ${tono}`}>ROAS {g.roas == null ? '–' : dec(g.roas)}</text>
            </g>
          );
        })}
      </svg>
      {sinGasto.length > 0 && <p className="nota">No se grafican {sinGasto.length === 1 ? 'el grupo' : 'los grupos'} sin gasto en el período ({sinGasto.map((g) => g.clave).join(', ')}): son ventas de anuncios que no invirtieron en estas fechas.</p>}
      <Tooltip tip={tip} ancho={ancho} />
    </div>
  );
}

// ---------------- Embudo ----------------

export function Embudo({ t }: { t: Metricas }) {
  const { ref, ancho } = useAncho();
  const pasos = [
    { k: 'Resultados en Meta', v: t.resultados_meta, nota: 'Leads y conversaciones según el canal' },
    { k: 'Leads en el CRM', v: t.leads_crm, nota: 'Atribuidos a un anuncio' },
    { k: 'Órdenes', v: t.ordenes, nota: 'Ventas registradas en el CRM' },
  ];
  const max = Math.max(...pasos.map((p) => p.v)) || 1;
  const etiqueta = Math.min(190, Math.max(140, ancho * 0.34)), alto = pasos.length * 58, conNota = ancho >= 520;
  return (
    <div className="grafico" ref={ref}>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Embudo: ${pasos.map((p) => `${p.k} ${p.v}`).join(', ')}`}>
        {pasos.map((p, i) => {
          const y = 6 + i * 58, ancoBar = Math.max(4, (p.v / max) * (ancho - etiqueta - 70));
          const previo = i ? pasos[i - 1].v : null;
          return (
            <g key={p.k}>
              <text x={etiqueta - 8} y={y + 15} textAnchor="end" className="eje fuerte">{p.k}</text>
              {conNota && <text x={etiqueta - 8} y={y + 30} textAnchor="end" className="eje">{p.nota}</text>}
              <rect x={etiqueta} y={y} width={ancoBar} height={26} rx={4} className={`m-o${i + 1}`} />
              <text x={etiqueta + ancoBar + 8} y={y + 18} className="valor">{entero(p.v)}</text>
              {previo != null && <text x={etiqueta} y={y - 6} className="eje paso">↓ {previo ? pct((p.v / previo) * 100, 1) : '–'} respecto de la etapa anterior</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------- Mapa de anuncios ----------------

export function MapaAnuncios({ filas, colores, d, roasObjetivo, seleccion, alElegir }: {
  filas: FilaCruce[]; colores: Map<string, string>; d: (v: number | null) => string; roasObjetivo: number | null; seleccion: string | null; alElegir: (id: string) => void;
}) {
  const { ref, ancho } = useAncho();
  const [tip, setTip] = useState<Tip | null>(null);
  const pts = filas.filter((f) => f.inversion > 0);
  if (!pts.length) return <p className="muted">Sin anuncios con inversión en el período.</p>;
  const H = 310, ml = 64, mb = 34, mt = 24, mr = 16;
  const maxX = Math.max(...pts.map((f) => f.inversion)) * 1.08;
  const maxY = Math.max(...pts.map((f) => f.monto), maxX * (roasObjetivo ?? 1), 1) * 1.08;
  const x = (v: number) => ml + (v / maxX) * (ancho - ml - mr);
  const y = (v: number) => H - mb - (v / maxY) * (H - mt - mb);
  const ticks = (max: number) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const linea = (roas: number) => { const xf = Math.min(maxX, maxY / roas); return { x1: x(0), y1: y(0), x2: x(xf), y2: y(xf * roas) }; };
  const corto = (v: number) => d(v).replace(/,\d+$/, '');
  const sedes = [...new Set(pts.map((f) => f.sede))];
  return (
    <div className="grafico" ref={ref} onPointerLeave={() => setTip(null)}>
      <p className="leyenda">
        {sedes.slice(0, 3).map((s) => <span key={s} className="punto-ley" style={{ ['--c' as any]: colores.get(s) }}>{s}</span>)}
        {sedes.length > 3 && <span className="punto-ley" style={{ ['--c' as any]: 'var(--neutro)' }}>Otras sedes</span>}
        <span className="l-ref">ROAS 1 (recupera la inversión)</span>
        {roasObjetivo != null && <span className="l-obj">ROAS objetivo {dec(roasObjetivo)}</span>}
      </p>
      <svg width="100%" viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label="Cada anuncio según su inversión y su monto vendido. Arriba de la línea de ROAS 1 recupera lo invertido.">
        {ticks(maxY).map((t) => <g key={'y' + t}><line x1={ml} x2={ancho - mr} y1={y(t)} y2={y(t)} className="grilla" /><text x={ml - 6} y={y(t) + 4} textAnchor="end" className="eje">{corto(t)}</text></g>)}
        {ticks(maxX).map((t, i, arr) => <text key={'x' + t} x={x(t)} y={H - mb + 16} textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'} className="eje">{corto(t)}</text>)}
        <text x={ancho - mr} y={H - 4} textAnchor="end" className="eje">Inversión →</text>
        <text x={ml} y={mt - 10} className="eje">↑ Monto vendido</text>
        <line {...linea(1)} className="ref-1" />
        {roasObjetivo != null && <line {...linea(roasObjetivo)} className="ref-obj" />}
        {[...pts].sort((a, b) => b.ordenes - a.ordenes).map((f) => {
          const sel = seleccion === f.ad_id;
          return (
            <circle key={f.ad_id} cx={x(f.inversion)} cy={y(f.monto)} r={(f.ordenes ? 5 + Math.sqrt(f.ordenes) * 2.6 : 4) + (sel ? 2 : 0)}
              className={`burbuja clic ${sel ? 'sel' : ''}`} style={{ fill: colores.get(f.sede) ?? 'var(--neutro)' }}
              onClick={() => alElegir(f.ad_id)}
              onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, contenido: <><b>{f.anuncio}</b><div className="muted">{f.sede} · {f.campana}</div>{fila('Inversión', d(f.inversion))}{fila('Monto vendido', d(f.monto))}{fila('ROAS', f.roas == null ? '–' : dec(f.roas))}{fila('Órdenes', entero(f.ordenes))}{fila('Leads CRM', entero(f.leads_crm))}<div className="muted">Tocá para verlo en la tabla</div></> }); }} />
          );
        })}
      </svg>
      <p className="nota">Cada burbuja es un anuncio; el tamaño indica cuántas órdenes generó. Arriba de la línea gris recupera lo invertido; los puntos chicos sobre la base gastaron sin vender.</p>
      <Tooltip tip={tip} ancho={ancho} />
    </div>
  );
}

// ---------------- Concentración ----------------

export function Concentracion({ filas, d, alElegir }: { filas: FilaCruce[]; d: (v: number | null) => string; alElegir: (id: string) => void }) {
  const { ref, ancho } = useAncho();
  const conVentas = [...filas].filter((f) => f.monto > 0).sort((a, b) => b.monto - a.monto);
  if (!conVentas.length) return <p className="muted">Ningún anuncio registra ventas en el CRM para este filtro.</p>;
  const top = conVentas.slice(0, 8), totalMonto = conVentas.reduce((s, f) => s + f.monto, 0);
  const etiqueta = Math.min(190, Math.max(110, ancho * 0.3)), derecha = Math.min(200, ancho * 0.42), alto = top.length * 34 + 6, chars = Math.floor(etiqueta / 7.2);
  const max = top[0].monto;
  let acum = 0;
  return (
    <div className="grafico" ref={ref}>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Anuncios que más vendieron y su participación acumulada en el monto">
        {top.map((f, i) => {
          acum += f.monto;
          const yy = 4 + i * 34, w = Math.max(3, (f.monto / max) * (ancho - etiqueta - derecha));
          return (
            <g key={f.ad_id} className="clic" onClick={() => alElegir(f.ad_id)}>
              <title>{f.anuncio}</title>
              <text x={etiqueta - 8} y={yy + 15} textAnchor="end" className="eje">{f.anuncio.length > chars ? f.anuncio.slice(0, chars - 1) + '…' : f.anuncio}</text>
              <rect x={etiqueta} y={yy + 3} width={w} height={16} rx={4} className="m-s1" />
              <text x={etiqueta + w + 8} y={yy + 15} className="valor">{d(f.monto)} <tspan className="eje">· acum. {pct((acum / totalMonto) * 100)}</tspan></text>
            </g>
          );
        })}
      </svg>
      {conVentas.length > top.length && <p className="nota">Y {conVentas.length - top.length} anuncios más con ventas menores.</p>}
    </div>
  );
}
