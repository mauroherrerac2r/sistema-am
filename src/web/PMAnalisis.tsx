// Análisis de cuenta: la mirada completa de una cuenta publicitaria en un período.
import { useEffect, useMemo, useState } from 'react';
import type { DatosPM } from './PaidMedia';
import { useApp } from './contexto';
import { resultado } from './reglas';
import { canalAnuncio, resultadoAnuncio } from './reglas';
import { ubicaciones } from './datos';
import { sumarDias } from '../shared/fechas';
import { dinero, dinero0, entero, pct, pctSigno, dec } from './formato';
import { GraficoSerie } from './Grafico';
import { Kpi, Tabla, Aviso, Pill } from './ui';
import { cplTono } from './reglas';

const POSICION: Record<string, string> = {
  feed: 'Feed', instagram_reels: 'Reels', facebook_reels: 'Reels', story: 'Stories', instagram_stories: 'Stories', facebook_stories: 'Stories',
  instagram_explore: 'Explorar', instagram_explore_grid_home: 'Explorar', marketplace: 'Marketplace', video_feeds: 'Videos', right_hand_column: 'Columna derecha',
  an_classic: 'Audience Network', rewarded_video: 'Audience Network', messenger_inbox: 'Messenger', search: 'Búsqueda', facebook_reels_overlay: 'Reels (overlay)', instream_video: 'Video in-stream',
};
const PLATAFORMA: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' };

export function PMAnalisis({ d, irRecos }: { d: DatosPM; irRecos: () => void }) {
  const { clientes } = useApp();
  const est = (d as any).est;
  const clientesConCuentas = useMemo(() => clientes.filter((c) => d.cuentas.some((a) => a.cfg.client_id === c.id)), [clientes, d.cuentas]);
  const [cliente, setCliente] = useState(clientesConCuentas[0]?.id ?? '');
  const cuentasCli = d.cuentas.filter((a) => a.cfg.client_id === cliente);
  const [cuentaId, setCuentaId] = useState(cuentasCli[0]?.cfg.ad_account_id ?? '');
  const [dias, setDias] = useState(14);
  const cuenta = cuentasCli.find((a) => a.cfg.ad_account_id === cuentaId) ?? cuentasCli[0];
  const id = cuenta?.cfg.ad_account_id ?? '';
  const m = cuenta?.moneda ?? null;
  const hasta = sumarDias(d.hoy, -1), desde = sumarDias(hasta, -(dias - 1));
  const [ub, setUb] = useState<any[] | null>(null);

  useEffect(() => { if (!cuentasCli.find((a) => a.cfg.ad_account_id === cuentaId)) setCuentaId(cuentasCli[0]?.cfg.ad_account_id ?? ''); }, [cliente]); // eslint-disable-line
  useEffect(() => {
    if (!id) return;
    let vivo = true; setUb(null);
    ubicaciones([id], desde, hasta).then((r) => vivo && setUb(r)).catch(() => vivo && setUb([]));
    return () => { vivo = false; };
  }, [id, desde, hasta]);

  const r = useMemo(() => {
    if (!cuenta) return null;
    const canales = cuenta.cfg.canales;
    const filas = d.dias.filter((x) => x.ad_account_id === id);
    const per = filas.filter((x) => x.fecha >= desde && x.fecha <= hasta);
    const ant = filas.filter((x) => x.fecha >= sumarDias(desde, -dias) && x.fecha < desde);
    const s = (xs: typeof per, k: 'inversion' | 'impresiones' | 'clics_enlace') => xs.reduce((t, x) => t + Number(x[k] || 0), 0);
    const inv = s(per, 'inversion'), imp = s(per, 'impresiones'), clk = s(per, 'clics_enlace');
    const res = per.reduce((t, x) => t + resultado(x, canales), 0), resAnt = ant.reduce((t, x) => t + resultado(x, canales), 0);
    const frec = imp ? per.reduce((t, x) => t + Number(x.frecuencia || 0) * Number(x.impresiones), 0) / imp : null;
    const serie = [...per].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((x) => { const rr = resultado(x, canales); return { fecha: x.fecha, inversion: Number(x.inversion), resultados: rr, cpr: rr ? Number(x.inversion) / rr : null }; });
    const presupuesto = cuenta.cfg.presupuesto_semanal ? (cuenta.cfg.presupuesto_semanal / 7) * dias : null;
    // Campañas y conjuntos del período (desde los datos por anuncio).
    const ads = d.diarios.filter((x) => x.ad_account_id === id && x.fecha >= desde && x.fecha <= hasta);
    const porSet = new Map<string, { inv: number; res: number; imp: number; clk: number; campaign_id: string | null }>();
    for (const a of ads) {
      const set = est.adsets.get(a.adset_id ?? ''), camp = est.campanas.get(a.campaign_id ?? '');
      const canal = canalAnuncio(set?.destino, camp?.objetivo, camp?.nombre);
      const t = porSet.get(a.adset_id ?? '?') || { inv: 0, res: 0, imp: 0, clk: 0, campaign_id: a.campaign_id };
      t.inv += a.inversion; t.res += resultadoAnuncio(canal, a.leads, a.conversaciones); t.imp += a.impresiones; t.clk += a.clics_enlace;
      porSet.set(a.adset_id ?? '?', t);
    }
    const totalAds = [...porSet.values()].reduce((t, x) => t + x.inv, 0);
    const porCamp = new Map<string, { nombre: string; presupuesto: number | null; sets: any[]; inv: number; res: number }>();
    for (const [sid, t] of porSet) {
      const set = est.adsets.get(sid), camp = est.campanas.get(t.campaign_id ?? '');
      const k = t.campaign_id ?? '?';
      const c = porCamp.get(k) || { nombre: camp?.nombre ?? 'Campaña sin datos', presupuesto: camp?.presupuesto_diario ?? null, sets: [] as any[], inv: 0, res: 0 };
      c.sets.push({ id: sid, nombre: set?.nombre ?? sid, presupuesto: set?.presupuesto_diario ?? null, inv: t.inv, res: t.res, cpr: t.res ? t.inv / t.res : null, ctr: t.imp ? (t.clk / t.imp) * 100 : null, share: totalAds ? (t.inv / totalAds) * 100 : 0, aprendizaje: set?.aprendizaje ?? null, activo: set?.estado_efectivo === 'ACTIVE' });
      c.inv += t.inv; c.res += t.res; porCamp.set(k, c);
    }
    const campanas = [...porCamp.values()].sort((a, b) => b.inv - a.inv).map((c) => ({ ...c, sets: c.sets.sort((a, b) => b.inv - a.inv), share: totalAds ? (c.inv / totalAds) * 100 : 0 }));
    return { inv, imp, clk, res, resAnt, cpr: res ? inv / res : null, ctr: imp ? (clk / imp) * 100 : null, cpm: imp ? (inv / imp) * 1000 : null, frec, serie, pacing: presupuesto ? (inv / presupuesto) * 100 : null, campanas };
  }, [cuenta, d, id, desde, hasta, dias, est]);

  const ubic = useMemo(() => {
    if (!ub || !cuenta) return [];
    const g = new Map<string, { inv: number; res: number }>();
    for (const x of ub) {
      const nombre = x.plataforma === 'audience_network' ? 'Audience Network' : `${PLATAFORMA[x.plataforma] ?? x.plataforma} ${POSICION[x.posicion] ?? x.posicion}`;
      const t = g.get(nombre) || { inv: 0, res: 0 };
      t.inv += Number(x.inversion); t.res += resultado(x, cuenta.cfg.canales); g.set(nombre, t);
    }
    const tot = [...g.values()].reduce((t, x) => t + x.inv, 0);
    return [...g.entries()].map(([nombre, t]) => ({ nombre, inv: t.inv, cpr: t.res ? t.inv / t.res : null, share: tot ? (t.inv / tot) * 100 : 0 })).filter((x) => x.inv > 0).sort((a, b) => b.inv - a.inv).slice(0, 8);
  }, [ub, cuenta]);

  if (!cuenta || !r) return <Aviso>No hay cuentas para analizar con este filtro.</Aviso>;
  const recosCuenta = d.recos.filter((x) => x.ad_account_id === id);
  const obj = cuenta.cfg.cpl_objetivo, max = cuenta.cfg.cpl_maximo;
  const maxUb = Math.max(...ubic.map((u) => u.share), 1);

  return (
    <div className="pila">
      <section className="panel pila-chica">
        <div className="filtros-fila"><span className="muted chico etq">Cliente</span>
          {clientesConCuentas.map((c) => <button key={c.id} className={`btn ${c.id === cliente ? 'on' : ''}`} onClick={() => setCliente(c.id)}>{c.nombre}</button>)}
        </div>
        <div className="filtros-fila"><span className="muted chico etq">Cuenta</span>
          {cuentasCli.map((a) => <button key={a.cfg.ad_account_id} className={`btn ${a.cfg.ad_account_id === id ? 'on' : ''}`} onClick={() => setCuentaId(a.cfg.ad_account_id)}>{a.nombre}{a.cfg.sede ? ` · ${a.cfg.sede}` : ''}</button>)}
          <span className="sp" />
          <span className="muted chico etq">Período</span>
          {[7, 14, 28].map((n) => <button key={n} className={`btn ${n === dias ? 'on' : ''}`} onClick={() => setDias(n)}>{n} días</button>)}
        </div>
      </section>

      <div className="kpis">
        <Kpi titulo="Inversión" valor={dinero0(r.inv, m)} sub={r.pacing != null ? `${pct(r.pacing)} del presupuesto del período` : 'Sin presupuesto cargado'} />
        <Kpi titulo="Resultados" valor={entero(r.res)} sub={r.resAnt ? `${pctSigno((r.res / r.resAnt - 1) * 100)} vs los ${dias} días anteriores` : 'Sin período anterior para comparar'} />
        <Kpi titulo="CPL" valor={dinero(r.cpr, m)} sub={`Objetivo ${dinero(obj, m)} · máx. ${dinero(max, m)}`} tono={cplTono(r.cpr, obj, max)} />
        <Kpi titulo="CTR enlace" valor={pct(r.ctr, 2)} sub={`${entero(r.clk)} clics`} />
        <Kpi titulo="CPM" valor={dinero(r.cpm, m)} sub={`${entero(r.imp)} impresiones`} />
        <Kpi titulo="Frecuencia diaria" valor={dec(r.frec)} sub="Promedio ponderado por impresiones" />
      </div>

      <section className="panel"><h3>Evolución diaria</h3><GraficoSerie datos={r.serie} moneda={m} objetivo={obj} maximo={max} /></section>

      <section className="seccion">
        <h3>Campañas y conjuntos · {dias} días</h3>
        {!r.campanas.length ? <p className="muted">Sin gasto por anuncio en el período.</p> : (
          <Tabla>
            <thead><tr><th>Campaña / conjunto</th><th className="d">Presup. diario</th><th className="d">Gasto</th><th className="d">% gasto</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">CTR</th><th>Entrega</th></tr></thead>
            <tbody>{r.campanas.flatMap((c) => [
              <tr key={'c' + c.nombre} className="fila-campana"><td>{c.nombre}</td><td className="d">{dinero0(c.presupuesto, m)}</td><td className="d">{dinero(c.inv, m)}</td><td className="d">{pct(c.share)}</td><td className="d">{entero(c.res)}</td><td className={`d ${cplTono(c.res ? c.inv / c.res : null, obj, max)}`}>{dinero(c.res ? c.inv / c.res : null, m)}</td><td /><td /></tr>,
              ...c.sets.map((s: any) => (
                <tr key={s.id}><td className="sangria">{s.nombre}</td><td className="d">{dinero0(s.presupuesto, m)}</td><td className="d">{dinero(s.inv, m)}</td><td className="d">{pct(s.share)}</td><td className="d">{entero(s.res)}</td>
                  <td className={`d ${cplTono(s.cpr, obj, max)}`}>{dinero(s.cpr, m)}</td><td className="d">{pct(s.ctr, 2)}</td>
                  <td>{!s.activo ? <span className="muted">Inactivo</span> : s.aprendizaje === 'FAIL' ? <Pill nivel="atencion">Aprendizaje limitado</Pill> : s.aprendizaje === 'LEARNING' ? <Pill nivel="sin">En aprendizaje</Pill> : <Pill nivel="ok">Activo</Pill>}</td></tr>
              )),
            ])}</tbody>
          </Tabla>
        )}
      </section>

      <div className="graficos">
        <section className="panel">
          <h3>Ubicaciones</h3>
          <p className="nota">Dónde rinde la plata: CPL y peso en el gasto de cada ubicación.</p>
          {ub === null ? <p className="muted">Cargando…</p> : !ubic.length ? <p className="muted">Sin desglose por ubicación todavía: se completa con la sincronización de la noche.</p> : ubic.map((u) => (
            <div key={u.nombre} className="ubic">
              <span>{u.nombre}</span>
              <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="12" rx="3" className="fondo-barra" /><rect width={(u.share / maxUb) * 100} height="12" rx="3" className="m-s1" /></svg>
              <span className="d"><b className={cplTono(u.cpr, obj, max)}>{dinero(u.cpr, m)}</b> · {pct(u.share)}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h3>Lectura de la cuenta</h3>
          {!recosCuenta.length ? <p className="muted">Sin recomendaciones abiertas para esta cuenta.</p> : (
            <ul className="lectura">{recosCuenta.slice(0, 5).map((x) => <li key={x.clave}><b>{x.prioridad}:</b> {x.accion} <span className="muted">{x.porque}</span></li>)}</ul>
          )}
          <p><button className="btn" onClick={irRecos}>Ver todas las recomendaciones →</button></p>
        </section>
      </div>
    </div>
  );
}
