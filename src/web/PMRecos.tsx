// Recomendaciones por cuenta: qué hacer, por qué, cuánto mueve y de dónde sale.
import { useMemo, useState } from 'react';
import type { DatosPM } from './PaidMedia';
import { useApp } from './contexto';
import type { Prioridad, Reco, EstadoReco } from './reglasPM';
import { hastaPara } from './reglasPM';
import { guardarEstadoReco } from './datos';
import { dinero, pct } from './formato';
import { Kpi, Pill, Aviso, linkAnuncio } from './ui';
import { cplTono } from './reglas';

const NIVEL: Record<Prioridad, 'critico' | 'ok' | 'atencion'> = { Urgente: 'critico', Oportunidad: 'ok', Revisar: 'atencion' };
const TEXTO: Record<EstadoReco['estado'], string> = { hecho: 'Hecho ✓ · no vuelve por 7 días', pospuesta: 'Pospuesta para mañana', descartada: 'Descartada · no vuelve por 30 días' };

export function PMRecos({ d }: { d: DatosPM }) {
  const { clientes, yo } = useApp();
  const [cliente, setCliente] = useState('todos');
  const [prioridad, setPrioridad] = useState<'todas' | Prioridad>('todas');
  const [recien, setRecien] = useState<Map<string, EstadoReco['estado']>>(new Map());
  const [msg, setMsg] = useState('');
  const clientesConCuentas = useMemo(() => clientes.filter((c) => d.cuentas.some((a) => a.cfg.client_id === c.id)), [clientes, d.cuentas]);
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  // Las tratadas en esta visita siguen visibles (con Deshacer) hasta recargar.
  const tratadasAhora = useMemo(() => new Set(recien.keys()), [recien]);
  const todas: Reco[] = d.recos;
  const visibles = todas.filter((r) => (prioridad === 'todas' || r.prioridad === prioridad) && (cliente === 'todos' || d.cuentas.find((a) => a.cfg.ad_account_id === r.ad_account_id)?.cfg.client_id === cliente));
  const abiertas = todas.filter((r) => !tratadasAhora.has(r.clave));

  const marcar = async (r: Reco, estado: EstadoReco['estado'] | null) => {
    setMsg('');
    try {
      await guardarEstadoReco(r.clave, r.ad_account_id, estado, estado ? hastaPara(estado, d.hoy) : d.hoy);
      setRecien((x) => { const n = new Map(x); if (estado) n.set(r.clave, estado); else n.delete(r.clave); return n; });
    } catch (e: any) { setMsg(e.message); }
  };

  const cuentas = d.cuentas.filter((a) => visibles.some((r) => r.ad_account_id === a.cfg.ad_account_id));

  return (
    <div className="pila">
      <div className="kpis">
        <Kpi titulo="Urgentes" valor={abiertas.filter((r) => r.prioridad === 'Urgente').length} sub="Plata que se pierde hoy" tono={abiertas.some((r) => r.prioridad === 'Urgente') ? 'mal' : 'bien'} />
        <Kpi titulo="Oportunidades" valor={abiertas.filter((r) => r.prioridad === 'Oportunidad').length} sub="Más resultado con la misma plata" tono="bien" />
        <Kpi titulo="Para revisar" valor={abiertas.filter((r) => r.prioridad === 'Revisar').length} sub="Riesgos y pedidos del AM" tono="aviso" />
        <Kpi titulo="Tratadas ahora" valor={tratadasAhora.size} sub="Hechas, pospuestas o descartadas en esta visita" />
      </div>

      <section className="panel pila-chica">
        <div className="filtros-fila"><span className="muted chico etq">Cliente</span>
          <button className={`btn ${cliente === 'todos' ? 'on' : ''}`} onClick={() => setCliente('todos')}>Todos</button>
          {clientesConCuentas.map((c) => <button key={c.id} className={`btn ${c.id === cliente ? 'on' : ''}`} onClick={() => setCliente(c.id)}>{c.nombre}</button>)}
        </div>
        <div className="filtros-fila"><span className="muted chico etq">Prioridad</span>
          {(['todas', 'Urgente', 'Oportunidad', 'Revisar'] as const).map((p) => <button key={p} className={`btn ${prioridad === p ? 'on' : ''}`} onClick={() => setPrioridad(p)}>{p === 'todas' ? 'Todas' : p}</button>)}
        </div>
      </section>
      {msg && <Aviso tipo="error">{msg}</Aviso>}

      {!cuentas.length ? <Aviso>Sin recomendaciones abiertas para este filtro. Las tratadas vuelven a aparecer cuando vence su plazo, si la situación sigue igual.</Aviso> : (
        <div className="cuentas-recos">
          {cuentas.map((a) => {
            const m = a.moneda;
            return (
              <article key={a.cfg.ad_account_id} className={`panel cuenta-reco n-${a.sem.nivel}`}>
                <div className="fila">
                  <div><b>{a.nombre}{a.cfg.sede ? ` · ${a.cfg.sede}` : ''}</b><div className="muted chico">{nombreCliente.get(a.cfg.client_id)}</div></div>
                  <span className="sp" /><Pill nivel={a.sem.nivel} />
                </div>
                <p className="chico">CPL 7 días <b className={cplTono(a.sem.cpr_7d, a.cfg.cpl_objetivo, a.cfg.cpl_maximo)}>{dinero(a.sem.cpr_7d, m)}</b> · objetivo {dinero(a.cfg.cpl_objetivo, m)} · pacing {pct(a.sem.pacing_pct)}</p>
                {visibles.filter((r) => r.ad_account_id === a.cfg.ad_account_id).map((r) => {
                  const est = recien.get(r.clave);
                  return (
                    <div key={r.clave} className={`reco ${est ? 'tratada' : ''}`}>
                      <div className="fila"><Pill nivel={NIVEL[r.prioridad]}>{r.prioridad}</Pill><b className="tipo-reco">{r.tipo}</b><span className="muted chico">· {r.origen}</span></div>
                      <p><b>{r.accion}</b></p>
                      <p className="muted">{r.porque}</p>
                      <p className="chico"><span className="muted">Impacto estimado:</span> <b>{r.impacto}</b></p>
                      {!est ? (
                        <div className="seg">
                          <button className="btn primario" onClick={() => marcar(r, 'hecho')}>Hecho</button>
                          <button className="btn" onClick={() => marcar(r, 'pospuesta')}>Posponer</button>
                          <button className="btn" onClick={() => marcar(r, 'descartada')}>Descartar</button>
                          <a className="btn" href={r.ad_id ? linkAnuncio(r.ad_account_id, r.ad_id) : `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(r.ad_account_id)}`} target="_blank" rel="noopener noreferrer">Abrir en Ads Manager</a>
                        </div>
                      ) : (
                        <p className="bien chico"><b>{TEXTO[est]}</b> <button className="btn" onClick={() => marcar(r, null)}>Deshacer</button></p>
                      )}
                    </div>
                  );
                })}
              </article>
            );
          })}
        </div>
      )}
      <p className="nota">Salen de reglas automáticas sobre los datos de Meta (entrega, CPL, ritmo, pausar, escalar, fatiga, concentración, presupuesto entre conjuntos, aprendizaje) y de los análisis "versión Paid Media" que generan los AM. El cambio se hace en Ads Manager: el sistema no modifica las campañas. {yo.rol === 'pm' ? '' : 'Lo que marca cada PM queda guardado.'}</p>
    </div>
  );
}
