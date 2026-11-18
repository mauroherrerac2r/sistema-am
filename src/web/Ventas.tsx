// Fase 2 · Ventas y ROAS: carga del export del CRM, cruce con Meta y análisis con IA.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './contexto';
import { listarCargas, guardarCarga, ventasDeCarga, borrarCarga, analisisDeCarga, anunciosPeriodo, primerDiaMeta, Carga, Analisis } from './datos';
import { leerVentas, cruzar, agrupar, total, hallazgos, LecturaVentas, FilaCruce, Grupo, Metricas, AnuncioMeta } from './ventas';
import { resultadoAnuncio } from './reglas';
import { fechaEnZona, sumarDias } from '../shared/fechas';
import { dinero, entero, dec, pct, fechaCorta } from './formato';
import { Aviso, Kpi, Seccion, Tabla, linkAnuncio } from './ui';
import { Markdown } from './Markdown';

const nombreTipo = { cliente: 'Versión cliente', paid: 'Versión Paid Media' } as const;

export function Ventas() {
  const { visibles } = useApp();
  const [cargas, setCargas] = useState<Carga[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [error, setError] = useState('');
  const ids = useMemo(() => visibles.map((c) => c.id), [visibles]);

  const cargar = useCallback(async () => {
    try { setCargas(await listarCargas(ids)); } catch (e: any) { setError(e.message); }
  }, [ids]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombre = (id: string) => visibles.find((c) => c.id === id)?.nombre ?? '–';
  const carga = cargas?.find((c) => c.id === abierta);

  if (!visibles.length) return <Aviso>No hay clientes con el filtro actual.</Aviso>;
  if (carga) return <VistaCarga carga={carga} cliente={nombre(carga.client_id)} volver={() => setAbierta(null)} borrada={() => { setAbierta(null); cargar(); }} />;

  return (
    <div className="pila">
      <NuevaCarga creada={(id) => { cargar().then(() => setAbierta(id)); }} />
      <Seccion id="cargas" titulo="Cargas anteriores">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!cargas ? <p className="muted">Cargando…</p> : !cargas.length ? <p className="muted">Todavía no hay cargas de ventas para estos clientes.</p> : (
          <Tabla>
            <thead><tr><th>Cliente</th><th>Período</th><th>Fuente</th><th className="d">Anuncios</th><th>Nota</th><th>Cargada</th><th /></tr></thead>
            <tbody>{cargas.map((c) => (
              <tr key={c.id}>
                <td>{nombre(c.client_id)}</td><td>{fechaCorta(c.desde)} al {fechaCorta(c.hasta)}</td><td>{c.fuente}</td>
                <td className="d">{entero(c.filas)}</td><td className="muted">{c.nombre || '–'}</td>
                <td className="muted">{new Date(c.creado_en).toLocaleDateString('es-AR')}</td>
                <td><button className="btn" onClick={() => setAbierta(c.id)}>Ver análisis</button></td>
              </tr>
            ))}</tbody>
          </Tabla>
        )}
      </Seccion>
    </div>
  );
}

function NuevaCarga({ creada }: { creada: (id: string) => void }) {
  const { visibles } = useApp();
  const ayer = sumarDias(fechaEnZona('America/Argentina/Buenos_Aires'), -1);
  const [cliente, setCliente] = useState(visibles[0]?.id ?? '');
  const [rango, setRango] = useState({ desde: sumarDias(ayer, -17), hasta: ayer });
  const [nota, setNota] = useState('');
  const [texto, setTexto] = useState('');
  const [lectura, setLectura] = useState<LecturaVentas | null>(null);
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const procesar = (t: string) => {
    setMsg(null); setLectura(null);
    if (!t.trim()) return;
    if (t.startsWith('PK')) { setMsg({ t: 'Ese archivo es un Excel (.xlsx). Exportalo como CSV o copiá las celdas y pegalas.', error: true }); return; }
    try { setLectura(leerVentas(t)); } catch (e: any) { setMsg({ t: e.message, error: true }); }
  };

  const guardar = async () => {
    if (!lectura) return;
    setGuardando(true);
    try {
      const id = await guardarCarga({ client_id: cliente, desde: rango.desde, hasta: rango.hasta, nombre: nota.trim() || null, fuente: 'picallex' }, lectura.filas);
      setTexto(''); setLectura(null); setNota('');
      creada(id);
    } catch (e: any) { setMsg({ t: e.message, error: true }); }
    setGuardando(false);
  };

  const s = (k: 'leads' | 'ordenes' | 'monto') => (lectura?.filas ?? []).reduce((t, f) => t + f[k], 0);
  const valido = cliente && rango.desde && rango.hasta && rango.desde <= rango.hasta;

  return (
    <section className="seccion">
      <h2>Ventas y ROAS</h2>
      <p className="nota">Cargá el export de ventas del CRM (por anuncio de Meta) para un cliente y un período. El sistema lo cruza con la inversión de Meta de ese mismo período y calcula retorno, costo por orden y cierre por sede, campaña y anuncio.</p>
      <div className="panel">
        <div className="controles">
          <label>Cliente<select className="sel" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            {visibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
          <label>Desde<input type="date" value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
          <label>Hasta<input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
          <label className="largo">Nota (opcional)<input value={nota} placeholder="Ej: export PicallEx del 19/11" onChange={(e) => setNota(e.target.value)} /></label>
        </div>
        <p className="nota"><b>El período tiene que ser el mismo con el que exportaste del CRM.</b> El export no trae fechas: si no coinciden, el ROAS sale distorsionado.</p>
        <textarea className="pegar" rows={5} value={texto} placeholder="Pegá acá las celdas del export (con títulos), o elegí el archivo abajo" onChange={(e) => { setTexto(e.target.value); procesar(e.target.value); }} />
        <p><input type="file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setTexto(''); procesar(t); } }} /></p>
        {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
        {lectura && (
          <>
            <p>Leí <b>{lectura.filas.length} anuncios</b> ({lectura.leidas} filas{lectura.descartadas ? `, ${lectura.descartadas} sin ID de anuncio descartadas` : ''}): <b>{entero(s('leads'))}</b> leads, <b>{entero(s('ordenes'))}</b> órdenes y <b>{dec(s('monto'))}</b> de monto.</p>
            <p className="nota">Columnas reconocidas: {Object.entries(lectura.columnas).map(([k, v]) => `${v} → ${k}`).join(' · ')}</p>
            <button className="btn primario" disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar y analizar'}</button>
          </>
        )}
      </div>
    </section>
  );
}

function VistaCarga({ carga, cliente, volver, borrada }: { carga: Carga; cliente: string; volver: () => void; borrada: () => void }) {
  const { cuentasCfg, metaPorId } = useApp();
  const cfgs = useMemo(() => cuentasCfg.filter((c) => c.client_id === carga.client_id), [cuentasCfg, carga.client_id]);
  const cuentas = useMemo(() => cfgs.map((c) => c.ad_account_id), [cfgs]);
  const moneda = metaPorId.get(cuentas[0] ?? '')?.moneda ?? null;
  const [filas, setFilas] = useState<FilaCruce[] | null>(null);
  const [primerDia, setPrimerDia] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ventas, meta, p] = await Promise.all([ventasDeCarga(carga.id), anunciosPeriodo(cuentas, carga.desde, carga.hasta), primerDiaMeta(cuentas)]);
        const am: AnuncioMeta[] = meta.map((m) => ({ ad_id: m.ad_id, ad_account_id: m.ad_account_id, anuncio: m.anuncio, campana: m.campana, conjunto: m.conjunto, estado: m.estado, canal: m.canal, inversion: m.inversion, resultados: resultadoAnuncio(m.canal, m.leads, m.conversaciones) }));
        const sede = (cuenta: string) => { const c = cfgs.find((x) => x.ad_account_id === cuenta); return c?.sede || metaPorId.get(cuenta)?.nombre || cuenta; };
        if (vivo) { setFilas(cruzar(am, ventas, sede)); setPrimerDia(p); }
      } catch (e: any) { if (vivo) setError(e.message); }
    })();
    return () => { vivo = false; };
  }, [carga, cuentas, cfgs, metaPorId]);

  const d = (v: number | null) => dinero(v, moneda);
  const t = useMemo(() => (filas ? total(filas) : null), [filas]);
  const sedes = useMemo(() => (filas ? agrupar(filas, (f) => f.sede) : []), [filas]);
  const campanas = useMemo(() => (filas ? agrupar(filas.filter((f) => f.en_meta), (f) => f.campana) : []), [filas]);
  const hall = useMemo(() => (filas ? hallazgos(filas, sedes, (v) => dinero(v, moneda)) : []), [filas, sedes, moneda]);

  const entrada = useMemo(() => {
    if (!filas || !t) return null;
    const r = (x: Metricas) => ({ inversion: +x.inversion.toFixed(2), resultados_meta: x.resultados_meta, leads_crm: x.leads_crm, ordenes: x.ordenes, monto: +x.monto.toFixed(2), cobrado: +x.cobrado.toFixed(2), roas: x.roas == null ? null : +x.roas.toFixed(2), roas_cobrado: x.roas_cobrado == null ? null : +x.roas_cobrado.toFixed(2), costo_orden: x.costo_orden == null ? null : +x.costo_orden.toFixed(2), cierre_pct: x.cierre_pct == null ? null : +x.cierre_pct.toFixed(2) });
    const top = [...filas].sort((a, b) => b.inversion - a.inversion).slice(0, 30);
    const anuncios = [...new Map([...top, ...filas.filter((f) => f.ordenes > 0)].map((f) => [f.ad_id, f])).values()];
    return {
      cliente, moneda, periodo: { desde: carga.desde, hasta: carga.hasta }, fuente_ventas: carga.fuente,
      objetivos_cpl: cfgs.map((c) => ({ sede: c.sede || metaPorId.get(c.ad_account_id)?.nombre, canales: c.canales, cpl_objetivo: c.cpl_objetivo, cpl_maximo: c.cpl_maximo, presupuesto_semanal: c.presupuesto_semanal })),
      totales: r(t),
      por_sede: sedes.map((g) => ({ sede: g.clave, anuncios: g.anuncios, ...r(g) })),
      por_campana: campanas.slice(0, 20).map((g) => ({ campana: g.clave, anuncios: g.anuncios, ...r(g) })),
      anuncios: anuncios.map((f) => ({ id: f.ad_id, anuncio: f.anuncio, campana: f.campana, sede: f.sede, canal: f.canal, estado: f.estado, con_gasto_en_periodo: f.en_meta, ...r(f) })),
      hallazgos: hall.map((h) => h.texto),
    };
  }, [filas, t, sedes, campanas, hall, cliente, moneda, carga, cfgs, metaPorId]);

  const borrar = async () => {
    if (!window.confirm('¿Borrar esta carga y sus análisis? No se puede deshacer.')) return;
    try { await borrarCarga(carga.id); borrada(); } catch (e: any) { setError(e.message); }
  };

  const fueraDeRango = primerDia && carga.desde < primerDia;
  const visiblesAnuncios = (filas ?? []).filter((f) => verTodos || f.ordenes > 0 || f.inversion >= (t?.costo_orden ?? Infinity));

  return (
    <div className="pila">
      <div className="fila">
        <button className="btn" onClick={volver}>← Volver</button>
        <h2>{cliente} · {fechaCorta(carga.desde)} al {fechaCorta(carga.hasta)}</h2>
        <span className="sp" />
        <button className="btn" onClick={borrar}>Borrar carga</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {fueraDeRango && <Aviso>El sistema tiene datos de Meta desde el {fechaCorta(primerDia!)}: la inversión de los días anteriores no está incluida y el ROAS sale más alto de lo real.</Aviso>}
      {!filas || !t ? <p className="muted">Cruzando ventas con Meta…</p> : (
        <>
          <div className="kpis">
            <Kpi titulo="Inversión Meta" valor={d(t.inversion)} sub="Cuentas del cliente en el período" />
            <Kpi titulo="Monto vendido" valor={d(t.monto)} sub={`${d(t.cobrado)} cobrado`} />
            <Kpi titulo="ROAS" valor={t.roas == null ? '–' : dec(t.roas)} sub={`Cobrado: ${t.roas_cobrado == null ? '–' : dec(t.roas_cobrado)}`} tono={t.roas == null ? '' : t.roas >= 1 ? 'bien' : 'mal'} />
            <Kpi titulo="Órdenes" valor={entero(t.ordenes)} sub={`Costo por orden ${d(t.costo_orden)}`} />
            <Kpi titulo="Cierre lead → orden" valor={pct(t.cierre_pct, 1)} sub={`${entero(t.leads_crm)} leads CRM · ${entero(t.resultados_meta)} resultados Meta`} />
          </div>

          {hall.length > 0 && <ul className="hallazgos">{hall.map((h) => <li key={h.texto} className={h.tipo}>{h.texto}</li>)}</ul>}

          <Seccion id="ia" titulo="Análisis con IA"><PanelIA cargaId={carga.id} entrada={entrada} /></Seccion>

          <Seccion id="sedes" titulo="Por sede"><TablaGrupos grupos={sedes} etiqueta="Sede" d={d} /></Seccion>
          <Seccion id="campanas" titulo="Por campaña"><TablaGrupos grupos={campanas} etiqueta="Campaña" d={d} /></Seccion>

          <Seccion id="anuncios" titulo="Por anuncio" extra={<label className="en-linea"><input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver todos ({filas.length})</label>}>
            {!verTodos && <p className="nota">Se muestran los anuncios con ventas y los que gastaron más que el costo por orden promedio.</p>}
            <Tabla>
              <thead><tr><th>Anuncio</th><th>Sede</th><th>Campaña</th><th>Canal</th><th className="d">Inversión</th><th className="d">Result. Meta</th><th className="d">Leads CRM</th><th className="d">Órdenes</th><th className="d">Monto</th><th className="d">ROAS</th><th className="d">Costo x orden</th><th className="d">Cierre</th></tr></thead>
              <tbody>{visiblesAnuncios.map((f) => (
                <tr key={f.ad_id} className={f.en_meta ? '' : 'r-inactiva'}>
                  <td className="ancho">{f.ad_account_id ? <a href={linkAnuncio(f.ad_account_id, f.ad_id)} target="_blank" rel="noopener noreferrer">{f.anuncio}</a> : f.anuncio}<div className="chico muted">{f.ad_id}{f.en_meta ? '' : ' · sin gasto en el período'}</div></td>
                  <td>{f.sede}</td><td className="ancho">{f.campana}</td><td>{f.canal}</td>
                  <td className="d">{d(f.inversion)}</td><td className="d">{entero(f.resultados_meta)}</td><td className="d">{entero(f.leads_crm)}</td>
                  <td className="d">{entero(f.ordenes)}</td><td className="d">{d(f.monto)}</td>
                  <td className={`d ${f.roas == null ? '' : t.roas != null && f.roas >= t.roas ? 'bien' : f.ordenes === 0 && f.inversion > 0 ? 'mal' : 'aviso'}`}>{f.roas == null ? '–' : dec(f.roas)}</td>
                  <td className="d">{d(f.costo_orden)}</td><td className="d">{pct(f.cierre_pct, 1)}</td>
                </tr>
              ))}</tbody>
            </Tabla>
          </Seccion>
        </>
      )}
    </div>
  );
}

function TablaGrupos({ grupos, etiqueta, d }: { grupos: Grupo[]; etiqueta: string; d: (v: number | null) => string }) {
  if (!grupos.length) return <p className="muted">Sin datos.</p>;
  return (
    <Tabla>
      <thead><tr><th>{etiqueta}</th><th className="d">Anuncios</th><th className="d">Inversión</th><th className="d">Result. Meta</th><th className="d">Leads CRM</th><th className="d">Órdenes</th><th className="d">Monto</th><th className="d">ROAS</th><th className="d">ROAS cobrado</th><th className="d">Costo x orden</th><th className="d">Cierre</th><th className="d">Ticket</th></tr></thead>
      <tbody>{grupos.map((g) => (
        <tr key={g.clave}>
          <td className="ancho">{g.clave}</td><td className="d">{g.anuncios}</td><td className="d">{d(g.inversion)}</td><td className="d">{entero(g.resultados_meta)}</td>
          <td className="d">{entero(g.leads_crm)}</td><td className="d">{entero(g.ordenes)}</td><td className="d">{d(g.monto)}</td>
          <td className={`d ${g.roas == null ? '' : g.roas >= 1 ? 'bien' : 'mal'}`}>{g.roas == null ? '–' : dec(g.roas)}</td>
          <td className="d">{g.roas_cobrado == null ? '–' : dec(g.roas_cobrado)}</td><td className="d">{d(g.costo_orden)}</td><td className="d">{pct(g.cierre_pct, 1)}</td><td className="d">{d(g.ticket)}</td>
        </tr>
      ))}</tbody>
    </Tabla>
  );
}

function PanelIA({ cargaId, entrada }: { cargaId: string; entrada: object | null }) {
  const { sesion } = useApp();
  const [lista, setLista] = useState<Analisis[] | null>(null);
  const [contexto, setContexto] = useState('');
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [copiado, setCopiado] = useState('');

  const cargar = useCallback(async () => { try { setLista(await analisisDeCarga(cargaId)); } catch (e: any) { setMsg({ t: e.message, error: true }); } }, [cargaId]);
  useEffect(() => { cargar(); }, [cargar]);
  const generando = (lista ?? []).some((a) => a.estado === 'generando');
  useEffect(() => { if (!generando) return; const t = setInterval(cargar, 4000); return () => clearInterval(t); }, [generando, cargar]);

  const pedir = async (tipo: 'cliente' | 'paid') => {
    setMsg(null);
    const r = await fetch('/api/analisis', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` }, body: JSON.stringify({ carga_id: cargaId, tipo, contexto: contexto.trim() || null, entrada }) });
    if (!r.ok) setMsg({ t: await r.text(), error: true });
    else { setMsg({ t: 'Generando el análisis: tarda entre 1 y 3 minutos. Podés seguir mirando los números mientras tanto.' }); cargar(); }
  };

  const copiar = async (a: Analisis) => {
    try { await navigator.clipboard.writeText(a.contenido ?? ''); setCopiado(a.id); setTimeout(() => setCopiado(''), 2000); } catch { setMsg({ t: 'No se pudo copiar: seleccioná el texto a mano.', error: true }); }
  };

  return (
    <div className="pila-chica">
      <p className="nota">La IA escribe a partir de los números de esta pantalla. La versión cliente usa lenguaje de negocio; la de Paid Media trae acciones concretas por anuncio y campaña. Revisala antes de enviarla.</p>
      <textarea className="pegar" rows={2} value={contexto} maxLength={2000} placeholder="Contexto opcional para el análisis (ej: Roosevelt cambió de vendedor la semana pasada; el cliente quiere priorizar Palacios)" onChange={(e) => setContexto(e.target.value)} />
      <div className="seg">
        <button className="btn primario" disabled={!entrada || generando} onClick={() => pedir('cliente')}>Generar versión cliente</button>
        <button className="btn primario" disabled={!entrada || generando} onClick={() => pedir('paid')}>Generar versión Paid Media</button>
      </div>
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      {(lista ?? []).map((a) => (
        <article key={a.id} className="panel analisis">
          <div className="fila"><h3>{nombreTipo[a.tipo]}</h3><span className="muted chico">{new Date(a.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span><span className="sp" />
            {a.estado === 'listo' && <button className="btn" onClick={() => copiar(a)}>{copiado === a.id ? 'Copiado ✓' : 'Copiar texto'}</button>}
          </div>
          {a.contexto && <p className="nota">Contexto: {a.contexto}</p>}
          {a.estado === 'generando' && <p className="muted">Generando…</p>}
          {a.estado === 'error' && <Aviso tipo="error">No se pudo generar: {a.error}</Aviso>}
          {a.estado === 'listo' && a.contenido && <Markdown texto={a.contenido} />}
        </article>
      ))}
    </div>
  );
}
