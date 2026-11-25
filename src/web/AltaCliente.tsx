// Alta guiada de un cliente: nombre, AM, cuentas de Meta y la configuración de cada una, en un solo paso.
import { FormEvent, useMemo, useState } from 'react';
import { useApp } from './contexto';
import { supabase } from './supabase';
import { slug, numero } from '../server/config-csv';
import { Aviso, Tabla } from './ui';

const CANALES = ['Formulario', 'WhatsApp', 'Messenger', 'Instagram'];

interface FilaAlta { pm_id: string; sede: string; canales: string[]; mensual: string; semanal: string; obj: string; max: string }
const filaVacia = (): FilaAlta => ({ pm_id: '', sede: '', canales: [], mensual: '', semanal: '', obj: '', max: '' });
/** Semanal cargado, o calculado desde el mensual (30,4 días por mes). */
const semanalDe = (f: FilaAlta) => numero(f.semanal) ?? (numero(f.mensual) != null ? Math.round((numero(f.mensual)! / 30.4) * 7 * 100) / 100 : null);

export function AltaCliente({ cerrar }: { cerrar: () => void }) {
  const { yo, perfiles, clientes, cuentasCfg, cuentasMeta, recargar } = useApp();
  const ams = perfiles.filter((p) => p.rol !== 'pm');
  const pms = perfiles.filter((p) => p.rol === 'pm');
  const [nombre, setNombre] = useState('');
  const [amId, setAmId] = useState(yo.rol === 'pm' ? '' : yo.id);
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<Map<string, FilaAlta>>(new Map());
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const asignadas = useMemo(() => new Set(cuentasCfg.map((c) => c.ad_account_id)), [cuentasCfg]);
  const libres = cuentasMeta.filter((c) => c.bm_id && !asignadas.has(c.id));
  const b = busqueda.trim().toLowerCase();
  const filtradas = libres.filter((c) => !b || c.nombre.toLowerCase().includes(b) || c.id.includes(b));
  const metaDe = new Map(cuentasMeta.map((c) => [c.id, c]));

  const alternar = (id: string) => setSel((x) => { const n = new Map(x); n.has(id) ? n.delete(id) : n.set(id, filaVacia()); return n; });
  const cambiar = (id: string, cambio: Partial<FilaAlta>) => setSel((x) => new Map(x).set(id, { ...x.get(id)!, ...cambio }));

  const errores: string[] = [];
  if (!nombre.trim()) errores.push('Falta el nombre del cliente.');
  else if (clientes.some((c) => c.slug === slug(nombre))) errores.push('Ya existe un cliente con ese nombre: sumale las cuentas desde su ficha, abajo.');
  if (!sel.size) errores.push('Elegí al menos una cuenta de Meta.');
  for (const [id, f] of sel) {
    const n = metaDe.get(id)?.nombre ?? id;
    if (!f.canales.length) errores.push(`${n}: elegí al menos un canal.`);
    if (semanalDe(f) == null) errores.push(`${n}: falta el presupuesto (mensual o semanal).`);
    if (numero(f.obj) == null || numero(f.max) == null) errores.push(`${n}: faltan el CPL objetivo y el máximo.`);
    else if (numero(f.max)! < numero(f.obj)!) errores.push(`${n}: el CPL máximo no puede ser menor que el objetivo.`);
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (errores.length) return;
    setGuardando(true); setMsg(null);
    const { data: cli, error } = await supabase.from('clients').insert({ nombre: nombre.trim(), slug: slug(nombre), am_id: amId || null }).select('id').single();
    if (error) { setMsg({ t: error.message, error: true }); setGuardando(false); return; }
    const { error: e2 } = await supabase.from('client_accounts').insert([...sel].map(([id, f]) => ({
      ad_account_id: id, client_id: cli.id, pm_id: f.pm_id || null, sede: f.sede.trim() || null, canales: f.canales,
      presupuesto_mensual: numero(f.mensual), presupuesto_semanal: semanalDe(f), cpl_objetivo: numero(f.obj), cpl_maximo: numero(f.max), activa: true,
    })));
    if (e2) { await supabase.from('clients').delete().eq('id', cli.id); setMsg({ t: e2.message, error: true }); setGuardando(false); return; }
    await recargar();
    setGuardando(false);
    cerrar();
  };

  return (
    <form className="panel alta" onSubmit={guardar}>
      <div className="fila"><h3>Nuevo cliente</h3><span className="sp" /><button type="button" className="btn" onClick={cerrar}>Cancelar</button></div>

      <h4><span className="nro">1</span> Cliente</h4>
      <div className="controles">
        <label className="largo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: NEW SUNRISE GROUP" /></label>
        <label>AM<select className="sel" value={amId} onChange={(e) => setAmId(e.target.value)}>
          <option value="">Sin asignar</option>
          {ams.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
        </select></label>
      </div>

      <h4><span className="nro">2</span> Cuentas de Meta</h4>
      <p className="nota">Solo aparecen las cuentas que ve algún usuario de sistema conectado y que no están asignadas a otro cliente. ¿Falta una? Asignala al usuario de sistema en el Business Manager y tocá "Actualizar cuentas" en Sistema.</p>
      <div className="controles"><label className="largo">Buscar<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o ID de la cuenta" /></label></div>
      <div className="lista-cuentas">
        {!filtradas.length ? <p className="muted">{libres.length ? 'Ninguna cuenta coincide con la búsqueda.' : 'No hay cuentas sin asignar.'}</p> : filtradas.slice(0, 60).map((c) => (
          <label key={c.id} className={`cuenta-opcion ${sel.has(c.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
            <span><b>{c.nombre}</b><span className="muted chico"> · {c.id} · {c.moneda}</span></span>
          </label>
        ))}
        {filtradas.length > 60 && <p className="muted chico">Y {filtradas.length - 60} más: afiná la búsqueda.</p>}
      </div>

      {sel.size > 0 && (
        <>
          <h4><span className="nro">3</span> Configuración de cada cuenta</h4>
          <p className="nota">El presupuesto se puede cargar mensual o semanal: si cargás solo el mensual, el semanal se calcula solo. El PM se asigna por cuenta.</p>
          <Tabla>
            <thead><tr><th>Cuenta</th><th>PM</th><th>Sede (opcional)</th><th>Canales</th><th>Presup. mensual</th><th>Presup. semanal</th><th>CPL objetivo</th><th>CPL máximo</th></tr></thead>
            <tbody>{[...sel].map(([id, f]) => (
              <tr key={id}>
                <td>{metaDe.get(id)?.nombre}<div className="chico muted">{metaDe.get(id)?.moneda}</div></td>
                <td><select className="sel" value={f.pm_id} onChange={(e) => cambiar(id, { pm_id: e.target.value })}><option value="">Sin PM</option>{pms.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}</select></td>
                <td><input className="corto" value={f.sede} onChange={(e) => cambiar(id, { sede: e.target.value })} /></td>
                <td className="canales">{CANALES.map((k) => (
                  <label key={k}><input type="checkbox" checked={f.canales.includes(k)} onChange={(e) => cambiar(id, { canales: e.target.checked ? [...f.canales, k] : f.canales.filter((x) => x !== k) })} />{k}</label>
                ))}</td>
                <td><input className="num" inputMode="decimal" value={f.mensual} onChange={(e) => cambiar(id, { mensual: e.target.value })} /></td>
                <td><input className="num" inputMode="decimal" value={f.semanal} placeholder={semanalDe({ ...f, semanal: '' })?.toLocaleString('es-AR') ?? ''} onChange={(e) => cambiar(id, { semanal: e.target.value })} /></td>
                <td><input className="num" inputMode="decimal" value={f.obj} onChange={(e) => cambiar(id, { obj: e.target.value })} /></td>
                <td><input className="num" inputMode="decimal" value={f.max} onChange={(e) => cambiar(id, { max: e.target.value })} /></td>
              </tr>
            ))}</tbody>
          </Tabla>
        </>
      )}

      {errores.length > 0 && (nombre || sel.size > 0) && <ul className="faltantes">{errores.map((x) => <li key={x}>{x}</li>)}</ul>}
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      <div className="fila"><span className="sp" /><button className="btn primario" disabled={!!errores.length || guardando}>{guardando ? 'Guardando…' : `Crear cliente con ${sel.size} ${sel.size === 1 ? 'cuenta' : 'cuentas'}`}</button></div>
    </form>
  );
}
