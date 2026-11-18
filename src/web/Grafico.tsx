// Inversión diaria (barras) y CPL (línea) con objetivo y máximo como referencias.
import { useEffect, useRef, useState } from 'react';
import { dinero, entero, fechaCorta } from './formato';

export interface PuntoSerie { fecha: string; inversion: number; resultados: number; cpr: number | null }

export function GraficoSerie({ datos, moneda, objetivo, maximo }: { datos: PuntoSerie[]; moneda: string | null; objetivo: number | null; maximo: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (!datos.length) return <p className="muted">Sin inversión en el período.</p>;

  const H = 230, mt = 12, mb = 26, ml = 64, mr = 8;
  const maxC = Math.max(...datos.map((d) => d.cpr ?? 0), maximo ?? 0, objetivo ?? 0) * 1.15 || 1;
  const maxI = Math.max(...datos.map((d) => d.inversion)) * 1.5 || 1;
  const paso = (ancho - ml - mr) / datos.length;
  const x = (i: number) => ml + i * paso + paso / 2;
  const yC = (v: number) => H - mb - (v / maxC) * (H - mt - mb);
  const yI = (v: number) => H - mb - (v / maxI) * (H - mt - mb);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxC / 1.15);
  const cada = Math.max(1, Math.ceil(datos.length / Math.floor((ancho - ml) / 60)));
  const puntos = datos.map((d, i) => (d.cpr == null ? null : `${x(i)},${yC(d.cpr)}`));
  const tramos: string[][] = [[]];
  puntos.forEach((p) => (p ? tramos[tramos.length - 1].push(p) : tramos.push([])));
  const d = sel != null ? datos[sel] : null;

  return (
    <div className="grafico" ref={ref}>
      <svg width="100%" viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label="Inversión diaria y CPL de los últimos 14 días" onPointerLeave={() => setSel(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={ancho - mr} y1={yC(t)} y2={yC(t)} className="grilla" />
            <text x={ml - 6} y={yC(t) + 4} textAnchor="end">{dinero(t, moneda).replace(/,\d+$/, '')}</text>
          </g>
        ))}
        {datos.map((p, i) => <rect key={p.fecha} x={x(i) - paso * 0.35} width={paso * 0.7} y={yI(p.inversion)} height={H - mb - yI(p.inversion)} rx={2} className={`barra-inv ${sel === i ? 'sel' : ''}`} />)}
        {objetivo != null && <line x1={ml} x2={ancho - mr} y1={yC(objetivo)} y2={yC(objetivo)} className="ref-obj" />}
        {maximo != null && <line x1={ml} x2={ancho - mr} y1={yC(maximo)} y2={yC(maximo)} className="ref-max" />}
        {tramos.filter((t) => t.length > 1).map((t, i) => <polyline key={i} points={t.join(' ')} className="linea-cpl" />)}
        {datos.map((p, i) => p.cpr != null && <circle key={p.fecha} cx={x(i)} cy={yC(p.cpr)} r={3} className="punto-cpl" />)}
        {datos.map((p, i) => i % cada === 0 && <text key={p.fecha} x={x(i)} y={H - 8} textAnchor="middle">{fechaCorta(p.fecha)}</text>)}
        {datos.map((p, i) => <rect key={'h' + p.fecha} x={ml + i * paso} width={paso} y={mt} height={H - mt - mb} fill="transparent" onPointerEnter={() => setSel(i)} onClick={() => setSel(i)} />)}
      </svg>
      {d && (
        <div className="tip" style={{ left: Math.min(Math.max(0, x(sel!) - 90), ancho - 190) }}>
          <b>{fechaCorta(d.fecha)}</b>
          <div>Inversión <b>{dinero(d.inversion, moneda)}</b></div>
          <div>Resultados <b>{entero(d.resultados)}</b></div>
          <div>CPL <b>{dinero(d.cpr, moneda)}</b></div>
        </div>
      )}
      <p className="leyenda"><span className="l-inv">Inversión</span><span className="l-cpl">CPL</span><span className="l-obj">Objetivo</span><span className="l-max">Máximo</span></p>
    </div>
  );
}
