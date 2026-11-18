import type { ReactNode } from 'react';
import type { Nivel } from './reglas';

export const ETIQUETA: Record<Nivel, string> = { critico: 'Crítico', atencion: 'Atención', ok: 'OK', sin: 'Sin inversión', inactiva: 'Inactiva', info: 'Sin acceso' };

export function Pill({ nivel, children }: { nivel?: Nivel | null; children?: ReactNode }) {
  return <span className={`pill n-${nivel ?? 'sin'}`}>{children ?? (nivel ? ETIQUETA[nivel] : '–')}</span>;
}

/** Barra de avance con marca de referencia (100 %) y tope visual. */
export function Barra({ valor, tope, tono }: { valor: number | null; tope: number; tono: string }) {
  if (valor == null) return null;
  return (
    <span className="barra" aria-hidden="true">
      <i className={tono} style={{ width: `${Math.min(100, (valor / tope) * 100)}%` }} />
      <b style={{ left: `${(100 / tope) * 100}%` }} />
    </span>
  );
}

export function Kpi({ titulo, valor, sub, tono }: { titulo: string; valor: ReactNode; sub?: ReactNode; tono?: '' | 'mal' | 'aviso' | 'bien' }) {
  return (
    <div className={`kpi ${tono ? 'k-' + tono : ''}`}>
      <p className="k">{titulo}</p>
      <p className="v">{valor}</p>
      {sub && <p className="s">{sub}</p>}
    </div>
  );
}

export function Seccion({ id, titulo, extra, children }: { id: string; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="seccion">
      <div className="fila"><h2>{titulo}</h2><span className="sp" />{extra}</div>
      {children}
    </section>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return <div className="tabla"><table>{children}</table></div>;
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'error' }) {
  return <p className={`mensaje ${tipo}`}>{children}</p>;
}

export const linkAnuncio = (cuenta: string, ad: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(cuenta)}&selected_ad_ids=${encodeURIComponent(ad)}`;
