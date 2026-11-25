// Clientes y su configuración: reemplaza el Google Sheet.
import { useMemo, useState } from 'react';
import { useApp } from './contexto';
import { supabase } from './supabase';
import { leerConfig, slug, numero, FilaConfig } from '../server/config-csv';
import type { CfgCuenta } from './reglas';
import { Aviso, Tabla } from './ui';
import { CarpetaCliente } from './CarpetaCliente';
import { leerSheetDrive } from './api';
import { AltaCliente } from './AltaCliente';

const CANALES = ['Formulario', 'WhatsApp', 'Messenger', 'Instagram'];
const aNum = (s: string) => numero(s);
const deNum = (v: number | null) => (v == null ? '' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

export function Configuracion() {
  const { clientes, cuentasCfg, cuentasMeta, metaPorId, perfiles, recargar } = useApp();
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [alta, setAlta] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAm, setFiltroAm] = useState('todos');
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const ams = perfiles.filter((p) => p.rol !== 'pm');
  const pms = perfiles.filter((p) => p.rol === 'pm');
  const asignadas = useMemo(() => new Set(cuentasCfg.map((c) => c.ad_account_id)), [cuentasCfg]);
  const libres = cuentasMeta.filter((c) => !asignadas.has(c.id) && c.bm_id);

  const correr = async (f: () => PromiseLike<{ error: any }>, ok: string) => {
    const { error } = await f();
    setMsg(error ? { t: error.message, error: true } : { t: ok });
    if (!error) await recargar();
  };

  /** Qué le falta a la configuración de una cuenta para que las alertas funcionen bien. */
  const faltantes = (c: CfgCuenta) => [!c.canales.length && 'canales', c.presupuesto_semanal == null && 'presupuesto', (c.cpl_objetivo == null || c.cpl_maximo == null) && 'CPL', !c.pm_id && 'PM'].filter(Boolean) as string[];
  const b = busqueda.trim().toLowerCase();
  const lista = clientes.filter((cli) => {
    const cuentas = cuentasCfg.filter((c) => c.client_id === cli.id);
    if (b && !cli.nombre.toLowerCase().includes(b) && !cuentas.some((c) => (metaPorId.get(c.ad_account_id)?.nombre ?? '').toLowerCase().includes(b) || c.ad_account_id.includes(b) || (c.sede ?? '').toLowerCase().includes(b))) return false;
    if (filtroAm !== 'todos' && (filtroAm === 'sin' ? cli.am_id : cli.am_id !== filtroAm)) return false;
    if (soloIncompletos && !cuentas.some((c) => faltantes(c).length) && cuentas.length) return false;
    return true;
  });
  const nombrePerfil = new Map(perfiles.map((p) => [p.id, p.nombre || p.email]));

  return (
    <div className="pila">
      <section className="seccion">
        <h2>Clientes</h2>
        <p className="nota">Todo se carga acá: no hace falta ningún Sheet. Cualquier AM o PM puede crear un cliente, sumarle sus cuentas de Meta y completar presupuesto, CPL objetivo y máximo, canales, AM del cliente, PM de cada cuenta y carpeta de Drive. Los cambios se ven al instante en Operación.</p>
        {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
        <div className="controles">
          {!alta && <button className="btn primario" onClick={() => setAlta(true)}>+ Nuevo cliente</button>}
          <label className="largo">Buscar<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente, cuenta, sede o ID" /></label>
          <label>AM<select className="sel" value={filtroAm} onChange={(e) => setFiltroAm(e.target.value)}>
            <option value="todos">Todos</option>{ams.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}<option value="sin">Sin AM</option>
          </select></label>
          <label className="en-linea"><input type="checkbox" checked={soloIncompletos} onChange={(e) => setSoloIncompletos(e.target.checked)} /> Solo con datos incompletos</label>
        </div>
      </section>

      {alta && <AltaCliente cerrar={() => { setAlta(false); setMsg({ t: 'Cliente creado. Ya aparece en Operación y en el panel de Paid Media.' }); }} />}

      {!lista.length && <p className="muted">Ningún cliente coincide con el filtro.</p>}
      {lista.map((cli) => {
        const cuentas = cuentasCfg.filter((c) => c.client_id === cli.id);
        const incompletas = cuentas.filter((c) => faltantes(c).length).length;
        return (
          <details key={cli.id} className="panel cliente-cfg" open={!!b || lista.length === 1}>
            <summary className="ficha-cliente">
              <b>{cli.nombre}</b>
              <span className="muted chico">AM: {cli.am_id ? nombrePerfil.get(cli.am_id) : 'sin asignar'} · {cuentas.length} {cuentas.length === 1 ? 'cuenta' : 'cuentas'}{!cli.activo ? ' · inactivo' : ''}</span>
              {incompletas > 0 && <span className="pill n-atencion">{incompletas} {incompletas === 1 ? 'cuenta incompleta' : 'cuentas incompletas'}</span>}
              {!cuentas.length && <span className="pill n-atencion">Sin cuentas</span>}
            </summary>
            <div className="fila">
              <span className="muted chico">Datos del cliente</span><span className="sp" />
              <label className="en-linea">AM
                <select className="sel" value={cli.am_id ?? ''} onChange={(e) => correr(() => supabase.from('clients').update({ am_id: e.target.value || null }).eq('id', cli.id), 'AM actualizado.')}>
                  <option value="">Sin asignar</option>
                  {ams.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
                </select>
              </label>
              <label className="en-linea"><input type="checkbox" checked={cli.activo} onChange={(e) => correr(() => supabase.from('clients').update({ activo: e.target.checked }).eq('id', cli.id), e.target.checked ? 'Cliente activado.' : 'Cliente desactivado: deja de aparecer en Operación.')} /> Activo</label>
            </div>
            {!cuentas.length && <p className="muted">Sin cuentas todavía.</p>}
            {cuentas.length > 0 && (
              <Tabla>
                <thead><tr><th>Cuenta de Meta</th><th>PM</th><th>Sede</th><th>Canales</th><th>Presup. semanal</th><th>CPL objetivo</th><th>CPL máximo</th><th>Activa</th><th>Nota</th><th /></tr></thead>
                <tbody>{cuentas.map((c) => <FilaCuenta key={c.ad_account_id} pms={pms} c={c} nombre={metaPorId.get(c.ad_account_id)?.nombre ?? c.ad_account_id} moneda={metaPorId.get(c.ad_account_id)?.moneda ?? ''} correr={correr} />)}</tbody>
              </Tabla>
            )}
            <div className="controles">
              <label>Sumar cuenta<select className="sel" defaultValue="" onChange={(e) => {
                const id = e.target.value; e.target.value = '';
                if (id) correr(() => supabase.from('client_accounts').insert({ ad_account_id: id, client_id: cli.id }), 'Cuenta sumada. Completá presupuesto, CPL y canales.');
              }}>
                <option value="">{libres.length ? 'Elegí una cuenta…' : 'No hay cuentas sin asignar'}</option>
                {libres.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.id}</option>)}
              </select></label>
            </div>
            <CarpetaCliente cliente={cli} alGuardar={recargar} />
          </details>
        );
      })}

      <details className="panel">
        <summary className="ficha-cliente"><b>Importar desde un Google Sheet</b><span className="muted chico">Solo para migrar clientes cargados en una planilla. El alta normal es "+ Nuevo cliente".</span></summary>
        <Importar />
      </details>
    </div>
  );
}

function FilaCuenta({ c, nombre, moneda, correr, pms }: { c: CfgCuenta; nombre: string; moneda: string; correr: (f: () => PromiseLike<{ error: any }>, ok: string) => Promise<void>; pms: { id: string; nombre: string | null; email: string }[] }) {
  const [f, setF] = useState({ sede: c.sede ?? '', canales: c.canales, ps: deNum(c.presupuesto_semanal), obj: deNum(c.cpl_objetivo), max: deNum(c.cpl_maximo), activa: c.activa, nota: c.nota ?? '' });
  const cambiado = f.sede !== (c.sede ?? '') || f.canales.join() !== c.canales.join() || aNum(f.ps) !== c.presupuesto_semanal || aNum(f.obj) !== c.cpl_objetivo || aNum(f.max) !== c.cpl_maximo || f.activa !== c.activa || f.nota !== (c.nota ?? '');
  const errorMax = aNum(f.obj) != null && aNum(f.max) != null && aNum(f.max)! < aNum(f.obj)!;
  const guardar = () => correr(() => supabase.from('client_accounts').update({
    sede: f.sede.trim() || null, canales: f.canales, presupuesto_semanal: aNum(f.ps), cpl_objetivo: aNum(f.obj), cpl_maximo: aNum(f.max),
    activa: f.activa, nota: f.nota.trim() || null, actualizado_en: new Date().toISOString(),
  }).eq('ad_account_id', c.ad_account_id), `${nombre}: guardado.`);
  return (
    <tr>
      <td>{nombre}<div className="chico muted">{c.ad_account_id} · {moneda}</div></td>
      <td><select className="sel" value={c.pm_id ?? ''} aria-label={`PM de ${nombre}`} onChange={(e) => correr(() => supabase.from('client_accounts').update({ pm_id: e.target.value || null }).eq('ad_account_id', c.ad_account_id), `${nombre}: PM actualizado.`)}>
        <option value="">Sin PM</option>
        {pms.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
      </select></td>
      <td><input className="corto" value={f.sede} placeholder="Opcional" onChange={(e) => setF({ ...f, sede: e.target.value })} /></td>
      <td className="canales">{CANALES.map((k) => (
        <label key={k}><input type="checkbox" checked={f.canales.includes(k)} onChange={(e) => setF({ ...f, canales: e.target.checked ? [...f.canales, k] : f.canales.filter((x) => x !== k) })} />{k}</label>
      ))}</td>
      <td><input className="num" inputMode="decimal" value={f.ps} onChange={(e) => setF({ ...f, ps: e.target.value })} /></td>
      <td><input className="num" inputMode="decimal" value={f.obj} onChange={(e) => setF({ ...f, obj: e.target.value })} /></td>
      <td><input className={`num ${errorMax ? 'invalido' : ''}`} inputMode="decimal" value={f.max} title={errorMax ? 'El máximo no puede ser menor que el objetivo' : ''} onChange={(e) => setF({ ...f, max: e.target.value })} /></td>
      <td><input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} /></td>
      <td><input value={f.nota} placeholder="Ej: inicia el 1/12" onChange={(e) => setF({ ...f, nota: e.target.value })} /></td>
      <td className="acciones">
        <button className="btn primario" disabled={!cambiado || errorMax} onClick={guardar}>Guardar</button>
        <button className="btn" onClick={() => { if (window.confirm(`¿Quitar ${nombre} de este cliente? Las métricas guardadas no se borran.`)) correr(() => supabase.from('client_accounts').delete().eq('ad_account_id', c.ad_account_id), `${nombre} quitada del cliente.`); }}>Quitar</button>
      </td>
    </tr>
  );
}

/** Importa el CSV del Sheet actual. Solo cuentas que algún usuario de sistema ya ve. */
function Importar() {
  const { clientes, metaPorId, perfiles, recargar } = useApp();
  const [filas, setFilas] = useState<FilaConfig[] | null>(null);
  const [estado, setEstado] = useState<{ t: string; error?: boolean } | null>(null);

  const [pegado, setPegado] = useState('');
  const [linkSheet, setLinkSheet] = useState('');
  const procesar = (texto: string) => {
    setEstado(null); setFilas(null);
    if (!texto.trim()) return;
    if (texto.startsWith('PK')) { setEstado({ t: 'Ese archivo es un Excel (.xlsx). Descargalo como CSV, o copiá las celdas y pegalas en el recuadro.', error: true }); return; }
    try {
      const f = leerConfig(texto);
      if (!f.length) setEstado({ t: 'No encontré filas. La primera fila tiene que tener los títulos (Cliente, ID cuenta publicitaria, …).', error: true });
      else setFilas(f);
    } catch (e: any) { setEstado({ t: e.message, error: true }); }
  };
  const leer = async (file: File | undefined) => { if (file) procesar(await file.text()); };

  const ok = (filas || []).filter((f) => metaPorId.has(f.ad_account_id));
  const faltan = (filas || []).filter((f) => !metaPorId.has(f.ad_account_id));

  const importar = async () => {
    const porEmail = new Map(perfiles.map((p) => [p.email.toLowerCase(), p.id]));
    const grupos = new Map<string, FilaConfig[]>();
    ok.forEach((f) => grupos.set(f.slug, [...(grupos.get(f.slug) || []), f]));
    try {
      for (const [s, cs] of grupos) {
        const existente = clientes.find((c) => c.slug === s);
        const am = cs.find((c) => c.am_email)?.am_email;
        const datos: any = { slug: s, nombre: cs[0].cliente, activo: cs.some((c) => c.activa) };
        if (am && porEmail.has(am)) datos.am_id = porEmail.get(am);
        const { data, error } = existente
          ? await supabase.from('clients').update(datos).eq('id', existente.id).select('id').single()
          : await supabase.from('clients').insert(datos).select('id').single();
        if (error) throw error;
        const { error: e2 } = await supabase.from('client_accounts').upsert(cs.map((c) => ({
          ad_account_id: c.ad_account_id, client_id: data.id, sede: c.sede, canales: c.canales, presupuesto_mensual: c.presupuesto_mensual,
          presupuesto_semanal: c.presupuesto_semanal, cpl_objetivo: c.cpl_objetivo, cpl_maximo: c.cpl_maximo, activa: c.activa, nota: c.nota,
          actualizado_en: new Date().toISOString(),
        })), { onConflict: 'ad_account_id' });
        if (e2) throw e2;
      }
      setEstado({ t: `Importado: ${grupos.size} clientes y ${ok.length} cuentas.` });
      setFilas(null); setPegado('');
      await recargar();
    } catch (e: any) { setEstado({ t: e.message, error: true }); }
  };

  return (
    <section className="panel">
      <h3>Importar desde el Sheet</h3>
      <p className="nota">Actualiza lo que ya existe, no duplica. Columna opcional <b>AM</b> con el email del Account Manager.</p>
      <p><b>Opción 1 · Pegar:</b> en el Sheet, seleccioná todo (<kbd>Cmd/Ctrl + A</kbd>), copiá (<kbd>Cmd/Ctrl + C</kbd>) y pegá acá, títulos incluidos.</p>
      <textarea className="pegar" rows={5} value={pegado} placeholder="Pegá acá las celdas copiadas del Sheet" onChange={(e) => { setPegado(e.target.value); procesar(e.target.value); }} />
      <p><b>Opción 2 · Link del Google Sheet</b> (requiere Google Drive conectado en Sistema):</p>
      <div className="controles"><label className="largo">Link<input value={linkSheet} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(e) => setLinkSheet(e.target.value)} /></label>
        <button className="btn" disabled={!linkSheet.trim()} onClick={async () => { setEstado(null); try { const r = await leerSheetDrive(linkSheet); setPegado(''); procesar(r.texto); } catch (e: any) { setEstado({ t: e.message, error: true }); } }}>Leer Sheet</button></div>
      <p><b>Opción 3 · Archivo:</b> Archivo → Descargar → CSV en el Sheet, y elegilo acá.</p>
      <input type="file" onChange={(e) => leer(e.target.files?.[0])} />
      {estado && <Aviso tipo={estado.error ? 'error' : 'info'}>{estado.t}</Aviso>}
      {filas && (
        <>
          <p>{ok.length} cuentas listas para importar{faltan.length ? `; ${faltan.length} no las ve ningún usuario de sistema conectado y se omiten` : ''}.</p>
          {faltan.length > 0 && <Tabla><thead><tr><th>Cliente</th><th>Cuenta</th><th>ID</th></tr></thead><tbody>{faltan.map((f) => <tr key={f.ad_account_id}><td>{f.cliente}</td><td>{f.cuenta}</td><td>{f.ad_account_id}</td></tr>)}</tbody></Tabla>}
          <button className="btn primario" disabled={!ok.length} onClick={importar}>Importar {ok.length} cuentas</button>
        </>
      )}
    </section>
  );
}
