// Visor mínimo de markdown (títulos, viñetas, listas numeradas, negritas, tablas).
// Arma elementos de React: nunca inserta HTML, así que el texto del modelo no puede inyectar código.
import type { ReactNode } from 'react';

function enLinea(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}

export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(h[1].length <= 2 ? <h3 key={i}>{enLinea(h[2])}</h3> : <h4 key={i}>{enLinea(h[2])}</h4>); i++; continue; }
    if (/^\s*\|/.test(l)) {
      const filas: string[][] = [];
      while (i < lineas.length && /^\s*\|/.test(lineas[i])) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!celdas.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      const [enc, ...cuerpo] = filas;
      out.push(<div className="tabla" key={i}><table><thead><tr>{enc.map((c, j) => <th key={j}>{enLinea(c)}</th>)}</tr></thead><tbody>{cuerpo.map((f, k) => <tr key={k}>{f.map((c, j) => <td key={j}>{enLinea(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      const numerada = /^\s*\d+[.)]/.test(l);
      const items: string[] = [];
      while (i < lineas.length && /^\s*([-*]|\d+[.)])\s+/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*([-*]|\d+[.)])\s+/, '')); i++; }
      const lis = items.map((t, j) => <li key={j}>{enLinea(t)}</li>);
      out.push(numerada ? <ol key={i}>{lis}</ol> : <ul key={i}>{lis}</ul>);
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|\s*\||\s*([-*]|\d+[.)])\s+)/.test(lineas[i])) { parrafo.push(lineas[i]); i++; }
    out.push(<p key={i}>{enLinea(parrafo.join(' '))}</p>);
  }
  return <div className="markdown">{out}</div>;
}
