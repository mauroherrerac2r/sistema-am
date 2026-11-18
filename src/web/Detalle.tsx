// Detalle de un cliente: cuentas, anuncios activos 7 días, evolución 14 días y entrega de conjuntos.
import { useEffect, useMemo, useState } from 'react';
import type { ClienteVista } from './Inicio';
import { anunciosPeriodo, conjuntosConObservaciones, frecuencias7d } from './datos';
import { armarAnuncios, resultado, cplTono, pacingTono, observacionConjunto, VEREDICTO_NIVEL, Anuncio, Dia } from './reglas';
import { dinero, dinero0, entero, pct, pctSigno, dec, fechaCorta } from './formato';
import { Pill, Tabla, Aviso, linkAnuncio } from './ui';
import { GraficoSerie } from './Grafico';
import { sumarDias } from '../shared/fechas';

export function Detalle({ cliente, dias }: { cliente: ClienteVista; dias: Dia[] }) {
  const m = cliente.moneda;
  const ids = useMemo(() => cliente.cuentas.map((c) => c.cfg.ad_account_id), [cliente]);
  const cfgPorCuenta = useMemo(() => new Map(cliente.cuentas.map((c) => [c.cfg.ad_account_id, c.cfg])), [cliente]);
  const nombre = useMemo(() => new Map(cliente.cuentas.map((c) => [c.cfg.ad_account_id, c.nombre])), [cliente]);
  const desde = cliente.cuentas[0]?.sem.desde, hasta = cliente.cuentas[0]?.sem.hasta;
  const [ads, setAds] = useState<Anuncio[] | null>(null);
  const [conj, setConj] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    setAds(null); setConj(null);
    (async () => {
      try {
        const [crudos, f7, obs] = await Promise.all([anunciosPeriodo(ids, desde, hasta), frecuencias7d(ids), conjuntosConObservaciones(ids)]);
        const activos = crudos.filter((a) => a.estado === 'ACTIVE').map((a) => ({ ...a, frecuencia: f7.get(a.ad_id)?.frecuencia ?? a.frecuencia }));
        if (vivo) { setAds(armarAnuncios(activos, cfgPorCuenta)); setConj(obs); }
      } catch (e: any) { if (vivo) setError(e.message); }
    })();
    return () => { vivo = false; };
  }, [ids, desde, hasta, cfgPorCuenta]);

  const serie = useMemo(() => {
    const inicio = sumarDias(hasta, -13);
    const porFecha = new Map<string, { fecha: string; inversion: number; resultados: number }>();
    dias.filter((d) => ids.includes(d.ad_account_id) && d.fecha >= inicio && d.fecha <= hasta).forEach((d) => {
      const p = porFecha.get(d.fecha) || { fecha: d.fecha, inversion: 0, resultados: 0 };
      p.inversion += d.inversion; p.resultados += resultado(d, cfgPorCuenta.get(d.ad_account_id)!.canales);
      porFecha.set(d.fecha, p);
    });
    return [...porFecha.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((p) => ({ ...p, cpr: p.resultados ? p.inversion / p.resultados : null }));
  }, [dias, ids, hasta, cfgPorCuenta]);

  return (
    <div className="detalle">
      <div className="fila"><h2>{cliente.nombre}</h2><span className="sp" /><Pill nivel={cliente.total.nivel} /></div>
      <p className="nota">Del {fechaCorta(desde)} al {fechaCorta(hasta)}. Pacing contra presupuesto semanal; CPL contra objetivo y máximo.</p>

      <h3>Cuentas</h3>
      <Tabla>
        <thead><tr><th>Cuenta</th><th>Canales</th><th>Estado en Meta</th><th className="d">Inversión</th><th className="d">Presup. semanal</th><th className="d">Pacing</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">Obj. / máx.</th><th className="d">CPL vs previa</th><th className="d">Pedidos</th><th className="d">CTR</th><th className="d">CPM</th><th className="d">Días sin entrega</th><th>Estado</th><th>Motivo</th></tr></thead>
        <tbody>{cliente.cuentas.map(({ cfg, nombre: n, sem: s, moneda }) => (
          <tr key={cfg.ad_account_id} className={`r-${s.nivel}`}>
            <td>{n}</td><td>{cfg.canales.join(', ') || '–'}</td><td className={s.estado_meta === 'Activa' ? '' : 'mal'}>{s.estado_meta}</td>
            <td className="d">{dinero(s.inv_7d, moneda)}</td><td className="d">{dinero0(cfg.presupuesto_semanal, moneda)}</td>
            <td className={`d ${s.nivel === 'inactiva' ? '' : pacingTono(s.pacing_pct)}`}>{pct(s.pacing_pct)}</td>
            <td className="d">{entero(s.resultados_7d)}</td><td className={`d ${cplTono(s.cpr_7d, cfg.cpl_objetivo, cfg.cpl_maximo)}`}>{dinero(s.cpr_7d, moneda)}</td>
            <td className="d muted">{dinero(cfg.cpl_objetivo, moneda)} / {dinero(cfg.cpl_maximo, moneda)}</td>
            <td className={`d ${s.cpr_var_pct == null ? '' : s.cpr_var_pct > 20 ? 'mal' : s.cpr_var_pct > 0 ? 'aviso' : 'bien'}`}>{pctSigno(s.cpr_var_pct)}</td>
            <td className="d">{s.pedidos_7d ? `${entero(s.pedidos_7d)} · ${dinero(s.costo_pedido, moneda)}` : '–'}</td>
            <td className="d">{pct(s.ctr_7d, 2)}</td><td className="d">{dinero(s.cpm_7d, moneda)}</td>
            <td className={`d ${(s.dias_sin_entrega ?? 0) >= 2 ? 'aviso' : ''}`}>{s.dias_sin_entrega ?? '–'}</td>
            <td><Pill nivel={s.nivel} /></td><td className="motivo">{s.motivo || '–'}</td>
          </tr>
        ))}</tbody>
      </Tabla>

      <h3>Anuncios activos · últimos 7 días</h3>
      <p className="nota">Ganador: CPL dentro del objetivo. Atención: entre objetivo y máximo. Pausar: sobre el máximo con 3+ resultados, o sin resultados, habiendo gastado 2 CPL máximos. Fatiga: frecuencia de 7 días mayor a 3. El nombre abre el anuncio en Ads Manager.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!ads ? <p className="muted">Cargando anuncios…</p> : !ads.length ? <p className="muted">No hay anuncios activos con gasto en los últimos 7 días.</p> : (
        <Tabla>
          <thead><tr><th>Anuncio</th><th>Cuenta</th><th>Conjunto</th><th>Canal</th><th className="d">Inversión</th><th className="d">% del gasto</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">Pedidos</th><th className="d">CTR</th><th className="d">Frecuencia</th><th>Veredicto</th></tr></thead>
          <tbody>{ads.map((a) => (
            <tr key={a.ad_id}>
              <td className="ancho"><a href={linkAnuncio(a.ad_account_id, a.ad_id)} target="_blank" rel="noopener noreferrer">{a.anuncio}</a></td>
              <td>{nombre.get(a.ad_account_id)}</td><td className="ancho">{a.conjunto}</td><td>{a.canal}</td>
              <td className="d">{dinero(a.inversion, m)}</td><td className={`d ${a.share_total >= 50 ? 'aviso' : ''}`}>{pct(a.share_total)}</td>
              <td className="d">{entero(a.resultados)}</td><td className={`d ${cplTono(a.cpr, a.cpl_objetivo, a.cpl_maximo)}`}>{dinero(a.cpr, m)}</td>
              <td className="d">{a.pedidos ? entero(a.pedidos) : '–'}</td><td className="d">{pct(a.impresiones ? (a.clics_enlace / a.impresiones) * 100 : null, 2)}</td>
              <td className={`d ${(a.frecuencia ?? 0) > 3 ? 'mal' : (a.frecuencia ?? 0) > 2 ? 'aviso' : ''}`}>{dec(a.frecuencia)}</td>
              <td><Pill nivel={VEREDICTO_NIVEL[a.veredicto] ?? 'sin'}>{a.veredicto}{a.fatiga && a.veredicto !== 'Pausar' ? ' · Fatiga' : ''}</Pill></td>
            </tr>
          ))}</tbody>
        </Tabla>
      )}

      <h3>Evolución diaria · 14 días</h3>
      <div className="panel"><GraficoSerie datos={serie} moneda={m} objetivo={cliente.total.cpl_objetivo} maximo={cliente.total.cpl_maximo} /></div>

      <h3>Entrega: conjuntos con observaciones</h3>
      <p className="nota">Conjuntos activos en aprendizaje, con aprendizaje limitado, con problemas o con pago pendiente.</p>
      {!conj ? <p className="muted">Cargando…</p> : (() => {
        const filas = conj.map((c) => ({ ...c, obs: observacionConjunto(c.estado_efectivo, c.aprendizaje) })).filter((c) => c.obs).sort((a, b) => Number(b.obs.grave) - Number(a.obs.grave));
        return !filas.length ? <p className="muted">Sin observaciones: los conjuntos activos entregan con normalidad.</p> : (
          <Tabla>
            <thead><tr><th>Cuenta</th><th>Campaña</th><th>Conjunto</th><th>Observación</th></tr></thead>
            <tbody>{filas.map((c) => (
              <tr key={c.id}><td>{nombre.get(c.ad_account_id)}</td><td className="ancho">{c.campana}</td><td className="ancho">{c.nombre}</td><td className={c.obs.grave ? 'mal' : 'aviso'}>{c.obs.texto}</td></tr>
            ))}</tbody>
          </Tabla>
        );
      })()}
    </div>
  );
}
