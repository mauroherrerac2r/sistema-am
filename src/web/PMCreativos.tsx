// Creativos por cliente: métricas clave, fatiga y recomendaciones de creativos por cuenta.
import { useMemo, useState } from 'react';
import type { DatosPM } from './PaidMedia';
import { useApp } from './contexto';
import type { Creativo, EstadoCreativo } from './reglasPM';
import { dinero, entero, pct, dec, fechaCorta } from './formato';
import { Kpi, linkAnuncio, Aviso } from './ui';
import { cplTono } from './reglas';

const TONO: Record<EstadoCreativo, string> = { Ganador: 'n-ok', Fatiga: 'n-atencion', Pausar: 'n-critico', Observar: 'n-atencion', 'Poco dato': 'n-sin' };
const ORDEN: Record<EstadoCreativo, number> = { Pausar: 0, Fatiga: 1, Observar: 2, 'Poco dato': 3, Ganador: 4 };

/** Línea simple sin ejes: la tendencia, no el valor exacto (el valor está en la ficha). */
function Linea({ xs, clase, alto = 40, label }: { xs: (number | null)[]; clase: string; alto?: number; label: string }) {
  const vals = xs.map((v) => (v == null ? null : v)).filter((v): v is number => v != null);
  if (vals.length < 2) return <p className="muted chico">Sin datos suficientes.</p>;
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = xs.map((v, i) => (v == null ? null : `${((i / (xs.length - 1)) * 200).toFixed(1)},${(alto - 4 - ((v - mn) / r) * (alto - 8)).toFixed(1)}`)).filter(Boolean).join(' ');
  return <svg width="100%" viewBox={`0 0 200 ${alto}`} role="img" aria-label={label} className="sparkline"><polyline points={pts} className={clase} /></svg>;
}

export function PMCreativos({ d }: { d: DatosPM }) {
  const { clientes } = useApp();
  const clientesConCuentas = useMemo(() => clientes.filter((c) => d.cuentas.some((a) => a.cfg.client_id === c.id)), [clientes, d.cuentas]);
  const [cliente, setCliente] = useState(clientesConCuentas[0]?.id ?? '');
  const [orden, setOrden] = useState<'gasto' | 'cpl' | 'problemas'>('gasto');
  const [soloActivos, setSoloActivos] = useState(true);
  const cuentasCli = d.cuentas.filter((a) => a.cfg.client_id === cliente);
  const ids = new Set(cuentasCli.map((a) => a.cfg.ad_account_id));
  const nombreDe = new Map(cuentasCli.map((a) => [a.cfg.ad_account_id, a.nombre]));
  const monedaDe = new Map(cuentasCli.map((a) => [a.cfg.ad_account_id, a.moneda]));
  const lista = d.creativos.filter((c) => ids.has(c.ad_account_id) && (!soloActivos || c.activo) && c.inversion > 0);
  const ordenada = [...lista].sort((a, b) => (orden === 'gasto' ? b.inversion - a.inversion : orden === 'cpl' ? (a.cpr ?? 1e9) - (b.cpr ?? 1e9) : ORDEN[a.estado] - ORDEN[b.estado] || b.inversion - a.inversion));
  const [selId, setSel] = useState<string | null>(null);
  const sel: Creativo | undefined = ordenada.find((c) => c.ad_id === selId) ?? ordenada[0];
  const recos = d.recos.filter((r) => r.creativa && ids.has(r.ad_account_id));
  const totalInv = lista.reduce((t, c) => t + c.inversion, 0);
  const m = (c: { ad_account_id: string }) => monedaDe.get(c.ad_account_id) ?? null;

  return (
    <div className="pila">
      <section className="panel pila-chica">
        <div className="filtros-fila"><span className="muted chico etq">Cliente</span>
          {clientesConCuentas.map((c) => <button key={c.id} className={`btn ${c.id === cliente ? 'on' : ''}`} onClick={() => { setCliente(c.id); setSel(null); }}>{c.nombre}</button>)}
        </div>
        <div className="filtros-fila"><span className="muted chico etq">Ordenar</span>
          {([['gasto', 'Gasto'], ['cpl', 'Mejor CPL'], ['problemas', 'Problemas primero']] as const).map(([k, t]) => <button key={k} className={`btn ${orden === k ? 'on' : ''}`} onClick={() => setOrden(k)}>{t}</button>)}
          <span className="sp" />
          <label className="en-linea"><input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} /> Solo activos</label>
        </div>
      </section>

      <div className="kpis">
        <Kpi titulo="Anuncios con gasto" valor={lista.length} sub="Últimos 14 días" />
        <Kpi titulo="Ganadores" valor={lista.filter((c) => c.estado === 'Ganador').length} sub="CPL dentro del objetivo" tono="bien" />
        <Kpi titulo="Con fatiga o para pausar" valor={lista.filter((c) => c.estado === 'Fatiga' || c.estado === 'Pausar').length} sub="Frecuencia alta, CTR en caída o CPL sobre el máximo" tono={lista.some((c) => c.estado === 'Pausar') ? 'mal' : 'aviso'} />
        <Kpi titulo="Concentración" valor={lista.length && totalInv ? pct((Math.max(...lista.map((c) => c.inversion)) / totalInv) * 100) : '–'} sub="Del gasto en el anuncio principal" />
      </div>

      {!lista.length ? <Aviso>Sin anuncios con gasto en los últimos 14 días para este cliente.</Aviso> : (
        <div className="creativos">
          <section className="galeria" aria-label="Galería de creativos">
            {ordenada.map((c) => (
              <button key={c.ad_id} className={`creativo ${sel?.ad_id === c.ad_id ? 'sel' : ''}`} onClick={() => setSel(c.ad_id)} aria-label={`Ver detalle de ${c.nombre}`}>
                {c.miniatura ? <img src={c.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="sin-mini">{c.formato}</div>}
                <div className="cuerpo">
                  <div className="fila"><span className={`pill ${TONO[c.estado]}`}>{c.estado}</span><span className="sp" /><span className="muted chico">{c.dias} días</span></div>
                  <b className="nombre">{c.nombre}</b>
                  <span className="muted chico">{nombreDe.get(c.ad_account_id)} · {c.formato}</span>
                  <div className="kv3">
                    <div><span className="muted chico">CPL</span><b className={cplTono(c.cpr, c.cpl_objetivo, c.cpl_maximo)}>{dinero(c.cpr, m(c))}</b></div>
                    <div><span className="muted chico">CTR</span><b>{pct(c.ctr, 2)}</b></div>
                    <div><span className="muted chico">Frec. 7d</span><b className={(c.frecuencia ?? 0) > 3 ? 'mal' : ''}>{dec(c.frecuencia, 1)}</b></div>
                  </div>
                  <Linea xs={c.serieCtr} clase="linea-ctr" label={`CTR diario de ${c.nombre}`} />
                  <span className="muted chico">CTR 14 días{c.caidaCtr != null ? ` · ${c.caidaCtr >= 0 ? '+' : ''}${Math.round(c.caidaCtr)}%` : ''}</span>
                </div>
              </button>
            ))}
          </section>

          {sel && (
            <aside className="panel ficha" aria-label="Detalle del creativo">
              <div className="fila"><span className={`pill ${TONO[sel.estado]}`}>{sel.estado}</span><span className="sp" /><a href={linkAnuncio(sel.ad_account_id, sel.ad_id)} target="_blank" rel="noopener noreferrer">Abrir en Ads Manager</a></div>
              <h3>{sel.nombre}</h3>
              <span className="muted chico">{nombreDe.get(sel.ad_account_id)} · {sel.campana} · {sel.conjunto} · {sel.canal}</span>
              {sel.miniatura && <img className="mini-grande" src={sel.miniatura} alt={`Miniatura de ${sel.nombre}`} referrerPolicy="no-referrer" />}
              <dl className="dl">
                <dt>Inversión 14 días</dt><dd>{dinero(sel.inversion, m(sel))} · {pct(sel.share)} de la cuenta</dd>
                <dt>Resultados</dt><dd>{entero(sel.resultados)}</dd>
                <dt>CPL · objetivo</dt><dd><b className={cplTono(sel.cpr, sel.cpl_objetivo, sel.cpl_maximo)}>{dinero(sel.cpr, m(sel))}</b> · {dinero(sel.cpl_objetivo, m(sel))}</dd>
                <dt>CTR · frecuencia 7 días</dt><dd>{pct(sel.ctr, 2)} · {dec(sel.frecuencia, 1)}</dd>
              </dl>
              <p className="muted chico">CTR por día ({fechaCorta(sel.fechas[0])} al {fechaCorta(sel.fechas[sel.fechas.length - 1])})</p>
              <Linea xs={sel.serieCtr} clase="linea-ctr" alto={60} label="CTR por día del creativo seleccionado" />
              <p className="muted chico">CPL por día</p>
              <Linea xs={sel.serieCpl} clase="linea-cpl" alto={60} label="CPL por día del creativo seleccionado" />
              <p className="lectura-caja"><b>Lectura:</b> {sel.lectura}</p>
            </aside>
          )}
        </div>
      )}

      <section className="panel">
        <h3>Recomendaciones de creativos por cuenta</h3>
        {!recos.length ? <p className="muted">Sin recomendaciones de creativos abiertas para este cliente.</p> : cuentasCli.filter((a) => recos.some((r) => r.ad_account_id === a.cfg.ad_account_id)).map((a) => (
          <div key={a.cfg.ad_account_id} className="grupo-recos">
            <b>{a.nombre}{a.cfg.sede ? ` · ${a.cfg.sede}` : ''}</b>
            {recos.filter((r) => r.ad_account_id === a.cfg.ad_account_id).map((r) => (
              <p key={r.clave}><span className={`pill ${r.prioridad === 'Urgente' ? 'n-critico' : r.prioridad === 'Oportunidad' ? 'n-ok' : 'n-atencion'}`}>{r.tipo}</span> <b>{r.accion}</b> <span className="muted">{r.porque}</span></p>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
