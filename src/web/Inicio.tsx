// Pantalla principal del AM: KPIs, operación del día, clientes 7 días y detalle desplegable.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, nombreCuenta } from './contexto';
import { diasCuenta, ultimaSync } from './datos';
import { evaluarDia, evaluarSemana, totalCliente, ORDEN, ritmoOk, pacingTono, cplTono, Dia, FilaSemana, TotalCliente, CfgCuenta } from './reglas';
import { fechaEnZona, horaEnZona, sumarDias } from '../shared/fechas';
import { dinero, dinero0, entero, pct, pctSigno, hhmm, haceMin, fechaCorta } from './formato';
import { Pill, Barra, Kpi, Seccion, Tabla, Aviso } from './ui';
import { Detalle } from './Detalle';

export interface CuentaVista { cfg: CfgCuenta; nombre: string; moneda: string | null; zona: string | null; sem: FilaSemana }
export interface ClienteVista { id: string; nombre: string; cuentas: CuentaVista[]; total: TotalCliente; moneda: string | null }

export function Inicio() {
  const { visibles, cuentasCfg, metaPorId } = useApp();
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [error, setError] = useState('');
  const [sync, setSync] = useState<{ terminado_en: string; estado: string } | null>(null);
  const [ayer, setAyer] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const detalleRef = useRef<HTMLDivElement>(null);

  const ids = useMemo(() => new Set(visibles.map((c) => c.id)), [visibles]);
  const cfgs = useMemo(() => cuentasCfg.filter((c) => ids.has(c.client_id)), [cuentasCfg, ids]);
  const cuentaIds = useMemo(() => cfgs.map((c) => c.ad_account_id), [cfgs]);

  const cargar = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([diasCuenta(cuentaIds, sumarDias(fechaEnZona('UTC'), -16)), ultimaSync('hoy')]);
      setDias(d); setSync(s); setError('');
    } catch (e: any) { setError(e.message); }
  }, [cuentaIds]);
  useEffect(() => { cargar(); const t = setInterval(() => { cargar(); setTick((x) => x + 1); }, 5 * 60_000); return () => clearInterval(t); }, [cargar]);

  const porCuenta = useMemo(() => {
    const m = new Map<string, Dia[]>();
    (dias || []).forEach((d) => m.set(d.ad_account_id, [...(m.get(d.ad_account_id) || []), d]));
    return m;
  }, [dias]);

  const hoy = useMemo(() => cfgs.map((cfg) => {
    const meta = metaPorId.get(cfg.ad_account_id);
    const zona = meta?.zona_horaria ?? null;
    const fecha = fechaEnZona(zona, ayer ? -1 : 0);
    const fila = (porCuenta.get(cfg.ad_account_id) || []).find((d) => d.fecha === fecha);
    const cliente = visibles.find((c) => c.id === cfg.client_id)!;
    return { cfg, cliente: cliente.nombre, nombre: nombreCuenta(cfg, meta), moneda: meta?.moneda ?? null, zona, ev: evaluarDia(cfg, fila, horaEnZona(zona), ayer) };
  }).sort((a, b) => ORDEN[a.ev.nivel] - ORDEN[b.ev.nivel] || b.ev.inversion - a.ev.inversion), [cfgs, metaPorId, porCuenta, ayer, visibles]);

  const clientes: ClienteVista[] = useMemo(() => visibles.map((cli) => {
    const cuentas = cfgs.filter((c) => c.client_id === cli.id).map((cfg) => {
      const meta = metaPorId.get(cfg.ad_account_id);
      const zona = meta?.zona_horaria ?? null;
      return { cfg, nombre: nombreCuenta(cfg, meta), moneda: meta?.moneda ?? null, zona, sem: evaluarSemana(cfg, meta, porCuenta.get(cfg.ad_account_id) || [], fechaEnZona(zona, -1)) };
    });
    return { id: cli.id, nombre: cli.nombre, cuentas, total: totalCliente(cuentas), moneda: cuentas.find((c) => c.moneda)?.moneda ?? null };
  }).sort((a, b) => ORDEN[a.total.nivel] - ORDEN[b.total.nivel] || b.total.inv_7d - a.total.inv_7d), [visibles, cfgs, metaPorId, porCuenta]);

  const abrir = (id: string, desplazar: boolean) => {
    setAbierto((x) => (x === id && !desplazar ? null : id));
    if (desplazar) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (!visibles.length) return <Aviso>No tenés clientes asignados. Elegí "Todos los clientes" arriba, o cargalos en la pestaña Clientes.</Aviso>;
  if (error) return <Aviso tipo="error">No se pudieron cargar las métricas: {error}</Aviso>;
  if (!dias) return <p className="muted">Cargando métricas…</p>;

  const activas = hoy.filter((h) => h.ev.nivel !== 'inactiva');
  const k = {
    crit: clientes.filter((c) => c.total.nivel === 'critico').length,
    atn: clientes.filter((c) => c.total.nivel === 'atencion').length,
    hcrit: hoy.filter((h) => h.ev.nivel === 'critico').length,
    hsin: hoy.filter((h) => /Sin entrega|No invirtió/.test(h.ev.motivo)).length,
    res: activas.reduce((t, h) => t + h.ev.resultados, 0),
  };
  const tono = (v: number, malo: 'mal' | 'aviso') => (v > 0 ? malo : 'bien');

  return (
    <div className="pila">
      <div className="kpis">
        <Kpi titulo="Clientes en crítico" valor={k.crit} sub="Últimos 7 días" tono={tono(k.crit, 'mal')} />
        <Kpi titulo="Clientes en atención" valor={k.atn} sub="Últimos 7 días" tono={tono(k.atn, 'aviso')} />
        <Kpi titulo={ayer ? 'Cuentas en crítico ayer' : 'Cuentas en crítico hoy'} valor={k.hcrit} sub={`De ${activas.length} activas`} tono={tono(k.hcrit, 'mal')} />
        <Kpi titulo={ayer ? 'Sin entrega ayer' : 'Sin entrega hoy'} valor={k.hsin} sub="Cuentas activas sin gasto" tono={tono(k.hsin, 'mal')} />
        <Kpi titulo={ayer ? 'Resultados ayer' : 'Resultados hoy'} valor={entero(k.res)} sub="Leads + conversaciones, según canal" />
      </div>

      <Seccion id="hoy" titulo="Operación del día" extra={<>
        <span className="muted chico">Meta actualizado {haceMin(sync?.terminado_en)}</span>
        <div className="seg">
          <button className={`btn ${!ayer ? 'on' : ''}`} onClick={() => setAyer(false)}>Hoy</button>
          <button className={`btn ${ayer ? 'on' : ''}`} onClick={() => setAyer(true)}>Ayer</button>
        </div>
        <button className="btn" onClick={cargar}>Actualizar</button>
      </>}>
        <p className="nota">Ritmo: inversión contra el presupuesto diario (semanal ÷ 7) proporcional a la hora de cada cuenta. El CPL del día alerta desde 3 resultados.</p>
        <Tabla>
          <thead><tr><th>Cliente</th><th>Cuenta</th><th>Sede</th><th className="d">Hora</th><th className="d">Inversión</th><th className="d">Presup. diario</th><th className="d">Ritmo</th><th className="d">Resultados</th><th className="d">CPL</th><th className="d">Obj. / máx.</th><th className="d">Pedidos</th><th>Estado</th><th>Motivo</th></tr></thead>
          <tbody>{hoy.map(({ cfg, cliente, nombre, moneda, zona, ev }) => (
            <tr key={cfg.ad_account_id} className={`r-${ev.nivel}`}>
              <td>{cliente}</td><td>{nombre}</td><td className="muted">{cfg.sede ?? '–'}</td>
              <td className="d">{ayer ? 'Día completo' : `${hhmm(ev.hora)} · ${(zona || 'UTC').split('/').pop()!.replace('_', ' ')}`}</td>
              <td className="d">{dinero(ev.inversion, moneda)}</td><td className="d">{dinero(ev.presupuesto_diario, moneda)}</td>
              <td className="d">{ev.ritmo_pct == null || ev.nivel === 'inactiva' ? '–' : <span className="ritmo"><Barra valor={ev.ritmo_pct} tope={140} tono={ritmoOk(ev.ritmo_pct, ayer) ? 'bien' : 'aviso'} /><span className={ritmoOk(ev.ritmo_pct, ayer) ? 'bien' : 'aviso'}>{pct(ev.ritmo_pct)}</span></span>}</td>
              <td className="d">{entero(ev.resultados)}</td>
              <td className={`d ${cplTono(ev.cpr, cfg.cpl_objetivo, cfg.cpl_maximo)}`}>{dinero(ev.cpr, moneda)}</td>
              <td className="d muted">{cfg.cpl_objetivo == null && cfg.cpl_maximo == null ? '–' : `${dinero(cfg.cpl_objetivo, moneda)} / ${dinero(cfg.cpl_maximo, moneda)}`}</td>
              <td className="d">{ev.pedidos ? entero(ev.pedidos) : '–'}</td>
              <td><Pill nivel={ev.nivel} /></td><td className="motivo">{ev.motivo || '–'}</td>
            </tr>
          ))}</tbody>
        </Tabla>
      </Seccion>

      <Seccion id="clientes" titulo="Clientes · últimos 7 días">
        <p className="nota">Ordenados por gravedad. Semana cerrada: del {fechaCorta(clientes[0]?.cuentas[0]?.sem.desde ?? sumarDias(fechaEnZona('UTC'), -7))} al {fechaCorta(clientes[0]?.cuentas[0]?.sem.hasta ?? sumarDias(fechaEnZona('UTC'), -1))}.</p>
        <div className="tarjetas">
          {clientes.map((c) => <Tarjeta key={c.id} c={c} onVer={() => abrir(c.id, true)} />)}
        </div>
      </Seccion>

      <div ref={detalleRef}>
        <Seccion id="detalle" titulo="Detalle por cliente" extra={abierto && <button className="btn" onClick={() => setAbierto(null)}>Ocultar detalle ▴</button>}>
          <div className="tabs">
            {clientes.map((c) => (
              <button key={c.id} className={`btn punto n-${c.total.nivel} ${abierto === c.id ? 'on' : ''}`} onClick={() => abrir(c.id, false)}>{c.nombre}</button>
            ))}
          </div>
          {abierto && clientes.find((c) => c.id === abierto)
            ? <Detalle cliente={clientes.find((c) => c.id === abierto)!} dias={dias} />
            : <p className="nota">Oculto para que la pantalla no se haga larga. Tocá un cliente para ver cuentas, anuncios, evolución diaria y entrega.</p>}
        </Seccion>
      </div>
    </div>
  );
}

function Tarjeta({ c, onVer }: { c: ClienteVista; onVer: () => void }) {
  const t = c.total, m = c.moneda;
  const tonoVar = t.cpr_var_pct == null ? '' : t.cpr_var_pct > 20 ? 'mal' : t.cpr_var_pct > 0 ? 'aviso' : 'bien';
  return (
    <article className={`tarjeta n-${t.nivel}`}>
      <div className="fila"><h3>{c.nombre}</h3><span className="sp" /><Pill nivel={t.nivel} /></div>
      <div className="kv2">
        <div><p className="k">Inversión</p><p className="v">{dinero0(t.inv_7d, m)}</p></div>
        <div><p className="k">CPL</p><p className={`v ${cplTono(t.cpr_7d, t.cpl_objetivo, t.cpl_maximo)}`}>{dinero(t.cpr_7d, m)}</p></div>
      </div>
      <p className="chico muted"><span className={pacingTono(t.pacing_pct)}>{pct(t.pacing_pct)}</span> del presupuesto semanal de {dinero0(t.presupuesto_semanal, m)}</p>
      <Barra valor={t.pacing_pct} tope={120} tono={pacingTono(t.pacing_pct) || 'neutro'} />
      <dl className="dl">
        <dt>Resultados</dt><dd>{entero(t.resultados_7d)}</dd>
        <dt>Objetivo / máximo</dt><dd>{dinero(t.cpl_objetivo, m)} / {dinero(t.cpl_maximo, m)}</dd>
        <dt>CPL vs semana previa</dt><dd className={tonoVar}>{pctSigno(t.cpr_var_pct)}</dd>
        {t.pedidos_7d > 0 && <><dt>Pedidos creados</dt><dd>{entero(t.pedidos_7d)} · {dinero(t.costo_pedido, m)} c/u</dd></>}
        <dt>Cuentas con inversión</dt><dd>{t.cuentas_con_inversion} de {t.cuentas_total}</dd>
      </dl>
      <p className="motivo chico">{t.motivo || 'Sin alertas.'}</p>
      <button className="btn" onClick={onVer}>Ver detalle</button>
    </article>
  );
}
