// Análisis puntual: un cliente, un canal y un rango de fechas.
import { useEffect, useMemo, useState } from 'react';
import { useApp, nombreCuenta } from './contexto';
import { anunciosPeriodo } from './datos';
import { armarAnuncios, resumir, lectura, cplTono, VEREDICTO_NIVEL, Anuncio, Canal } from './reglas';
import { fechaEnZona, sumarDias } from '../shared/fechas';
import { dinero, entero, pct, dec } from './formato';
import { Pill, Tabla, Aviso, Kpi, linkAnuncio } from './ui';

const CANALES: ('Todos' | Canal)[] = ['Todos', 'Formulario', 'WhatsApp', 'Messenger', 'Instagram', 'Otro'];
const ESTADO_AD: Record<string, string> = { ACTIVE: 'Activo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campaña pausada', ADSET_PAUSED: 'Conjunto pausado', ARCHIVED: 'Archivado', DELETED: 'Eliminado', WITH_ISSUES: 'Con problemas', DISAPPROVED: 'Rechazado', PENDING_REVIEW: 'En revisión' };

export function Analisis() {
  const { visibles, cuentasCfg, metaPorId } = useApp();
  const ayer = sumarDias(fechaEnZona('America/Argentina/Buenos_Aires'), -1);
  const [cliente, setCliente] = useState(visibles[0]?.id ?? '');
  const [canal, setCanal] = useState<'Todos' | Canal>('Todos');
  const [rango, setRango] = useState({ desde: sumarDias(ayer, -6), hasta: ayer });
  const [borrador, setBorrador] = useState(rango);
  const [crudos, setCrudos] = useState<Awaited<ReturnType<typeof anunciosPeriodo>> | null>(null);
  const [error, setError] = useState('');

  const cfgs = useMemo(() => cuentasCfg.filter((c) => c.client_id === cliente), [cuentasCfg, cliente]);
  const cfgPorCuenta = useMemo(() => new Map(cfgs.map((c) => [c.ad_account_id, c])), [cfgs]);
  const moneda = metaPorId.get(cfgs[0]?.ad_account_id ?? '')?.moneda ?? null;

  useEffect(() => {
    let vivo = true;
    setCrudos(null); setError('');
    anunciosPeriodo(cfgs.map((c) => c.ad_account_id), rango.desde, rango.hasta)
      .then((r) => vivo && setCrudos(r)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [cfgs, rango]);

  const todos = useMemo(() => (crudos ? armarAnuncios(crudos, cfgPorCuenta) : []), [crudos, cfgPorCuenta]);
  const filtrados: Anuncio[] = useMemo(() => (canal === 'Todos' ? todos : armarAnuncios((crudos || []).filter((a) => a.canal === canal), cfgPorCuenta)), [canal, todos, crudos, cfgPorCuenta]);
  const r = resumir(filtrados);
  const conGasto = [...new Set(todos.map((a) => a.canal))];
  const dineroM = (v: number) => dinero(v, moneda);

  const campanas = useMemo(() => {
    const g = new Map<string, { campana: string; cuenta: string; canal: string; anuncios: number; inversion: number; resultados: number; pedidos: number; imp: number; clk: number }>();
    filtrados.forEach((a) => {
      const k = a.ad_account_id + '·' + a.campana;
      const t = g.get(k) || { campana: a.campana, cuenta: a.ad_account_id, canal: a.canal, anuncios: 0, inversion: 0, resultados: 0, pedidos: 0, imp: 0, clk: 0 };
      t.anuncios++; t.inversion += a.inversion; t.resultados += a.resultados; t.pedidos += a.pedidos; t.imp += a.impresiones; t.clk += a.clics_enlace;
      g.set(k, t);
    });
    return [...g.values()].sort((a, b) => b.inversion - a.inversion);
  }, [filtrados]);

  const atajo = (dias: number | 'mes' | 'mesant') => {
    const hoy = fechaEnZona('America/Argentina/Buenos_Aires');
    let d: string, h = ayer;
    if (dias === 'mes') { d = hoy.slice(0, 8) + '01'; h = hoy; }
    else if (dias === 'mesant') { h = sumarDias(hoy.slice(0, 8) + '01', -1); d = h.slice(0, 8) + '01'; }
    else d = sumarDias(ayer, -(dias - 1));
    setBorrador({ desde: d, hasta: h }); setRango({ desde: d, hasta: h });
  };
  const valido = borrador.desde && borrador.hasta && borrador.desde <= borrador.hasta;
  const nombreDe = (id: string) => { const c = cfgPorCuenta.get(id); return c ? nombreCuenta(c, metaPorId.get(id)) : id; };

  if (!visibles.length) return <Aviso>No hay clientes para analizar con el filtro actual.</Aviso>;

  return (
    <div className="pila">
      <section className="seccion">
        <h2>Análisis puntual</h2>
        <p className="nota">Elegí cliente, canal y fechas. Incluye anuncios que tuvieron gasto aunque hoy estén pausados. El sistema guarda desde el día en que empezó a sincronizar (al arrancar trae los últimos 28 días).</p>
        <div className="controles">
          <label>Cliente<select className="sel" value={cliente} onChange={(e) => { setCliente(e.target.value); setCanal('Todos'); }}>
            {visibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
          <label>Canal<select className="sel" value={canal} onChange={(e) => setCanal(e.target.value as any)}>
            {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label>Desde<input type="date" value={borrador.desde} max={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} /></label>
          <label>Hasta<input type="date" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} /></label>
          <button className="btn primario" disabled={!valido} onClick={() => setRango(borrador)}>Analizar</button>
        </div>
        <div className="seg">
          <button className="btn" onClick={() => atajo(1)}>Ayer</button>
          <button className="btn" onClick={() => atajo(7)}>Últimos 7 días</button>
          <button className="btn" onClick={() => atajo(14)}>Últimos 14 días</button>
          <button className="btn" onClick={() => atajo('mes')}>Este mes</button>
          <button className="btn" onClick={() => atajo('mesant')}>Mes anterior</button>
        </div>
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!crudos ? <p className="muted">Cargando…</p> : (
        <>
          {canal !== 'Todos' && !filtrados.length && conGasto.length > 0 && <Aviso>Este cliente no tuvo gasto en {canal} en esas fechas; sí en {conGasto.join(', ')}.</Aviso>}
          <div className="kpis">
            <Kpi titulo="Inversión" valor={dinero(r.inversion, moneda)} sub={`${r.anuncios} anuncios con gasto · ${r.activos} activos hoy`} />
            <Kpi titulo={canal === 'Formulario' ? 'Leads' : 'Resultados'} valor={entero(r.resultados)} sub={canal === 'Todos' ? `${entero(r.leads)} leads · ${entero(r.conversaciones)} conversaciones` : undefined} />
            <Kpi titulo="CPL" valor={dinero(r.cpr, moneda)} sub={r.cpl_objetivo != null ? `Obj. ${dinero(r.cpl_objetivo, moneda)} · máx. ${dinero(r.cpl_maximo, moneda)}` : 'Sin objetivo cargado'} tono={cplTono(r.cpr, r.cpl_objetivo, r.cpl_maximo)} />
            {r.pedidos > 0 && <Kpi titulo="Pedidos creados" valor={entero(r.pedidos)} sub={`${dinero(r.costo_pedido, moneda)} por pedido`} />}
            <Kpi titulo="CTR enlace" valor={pct(r.ctr, 2)} sub={`${entero(r.clics_enlace)} clics`} />
            <Kpi titulo="CPM" valor={dinero(r.cpm, moneda)} sub={`${entero(r.impresiones)} impresiones`} />
          </div>
          <ul className="lectura">{lectura(filtrados, r, dineroM, canal !== 'Todos').map((t) => <li key={t}>{t}</li>)}</ul>

          <h3>Anuncios del período</h3>
          {!filtrados.length ? <p className="muted">No hay anuncios con gasto para este filtro.</p> : (
            <Tabla>
              <thead><tr><th>Anuncio</th><th>Cuenta</th><th>Canal</th><th>Campaña</th><th>Conjunto</th><th>Estado hoy</th><th className="d">Inversión</th><th className="d">{canal === 'Todos' ? '% del gasto' : '% del canal'}</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">Pedidos</th><th className="d">CTR</th><th className="d">CPM</th><th className="d" title="Promedio de la frecuencia diaria, ponderado por impresiones">Frec. diaria</th><th>Veredicto</th></tr></thead>
              <tbody>{filtrados.map((a) => (
                <tr key={a.ad_id}>
                  <td className="ancho"><a href={linkAnuncio(a.ad_account_id, a.ad_id)} target="_blank" rel="noopener noreferrer">{a.anuncio}</a></td>
                  <td>{nombreDe(a.ad_account_id)}</td><td>{a.canal}</td><td className="ancho">{a.campana}</td><td className="ancho">{a.conjunto}</td>
                  <td className={a.estado === 'ACTIVE' ? '' : 'muted'}>{ESTADO_AD[a.estado ?? ''] ?? a.estado ?? '–'}</td>
                  <td className="d">{dinero(a.inversion, moneda)}</td>
                  <td className={`d ${(canal === 'Todos' ? a.share_total : a.share_canal) >= 50 ? 'aviso' : ''}`}>{pct(canal === 'Todos' ? a.share_total : a.share_canal)}</td>
                  <td className="d">{entero(a.resultados)}</td><td className={`d ${cplTono(a.cpr, a.cpl_objetivo, a.cpl_maximo)}`}>{dinero(a.cpr, moneda)}</td>
                  <td className="d">{a.pedidos ? entero(a.pedidos) : '–'}</td>
                  <td className="d">{pct(a.impresiones ? (a.clics_enlace / a.impresiones) * 100 : null, 2)}</td>
                  <td className="d">{dinero(a.impresiones ? (a.inversion / a.impresiones) * 1000 : null, moneda)}</td>
                  <td className="d">{dec(a.frecuencia)}</td>
                  <td><Pill nivel={VEREDICTO_NIVEL[a.veredicto] ?? 'sin'}>{a.veredicto}</Pill></td>
                </tr>
              ))}</tbody>
            </Tabla>
          )}

          <h3>Campañas del período</h3>
          {campanas.length > 0 && (
            <Tabla>
              <thead><tr><th>Campaña</th><th>Cuenta</th><th>Canal</th><th className="d">Anuncios</th><th className="d">Inversión</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">Pedidos</th><th className="d">CTR</th></tr></thead>
              <tbody>{campanas.map((c) => {
                const cfg = cfgPorCuenta.get(c.cuenta);
                const cpr = c.resultados ? c.inversion / c.resultados : null;
                return (
                  <tr key={c.cuenta + c.campana}>
                    <td className="ancho">{c.campana}</td><td>{nombreDe(c.cuenta)}</td><td>{c.canal}</td><td className="d">{c.anuncios}</td>
                    <td className="d">{dinero(c.inversion, moneda)}</td><td className="d">{entero(c.resultados)}</td>
                    <td className={`d ${cplTono(cpr, cfg?.cpl_objetivo ?? null, cfg?.cpl_maximo ?? null)}`}>{dinero(cpr, moneda)}</td>
                    <td className="d">{c.pedidos ? entero(c.pedidos) : '–'}</td><td className="d">{pct(c.imp ? (c.clk / c.imp) * 100 : null, 2)}</td>
                  </tr>
                );
              })}</tbody>
            </Tabla>
          )}
        </>
      )}
    </div>
  );
}
