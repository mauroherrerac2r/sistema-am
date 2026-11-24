// Usuarios: alta, rol y contraseña (admin) y "Mi contraseña" (cualquier usuario). Sin emails.
import { FormEvent, useState } from 'react';
import { useApp } from './contexto';
import { supabase } from './supabase';
import { Aviso, Seccion, Tabla } from './ui';

const ROLES = [{ v: 'admin', t: 'Admin' }, { v: 'am', t: 'Account Manager' }, { v: 'pm', t: 'Paid Media' }];

function generarClave() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(r, (n) => c[n % c.length]).join('');
}

export function AdminUsuarios() {
  const { perfiles, sesion, yo, recargar } = useApp();
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'am', password: '' });
  const [claves, setClaves] = useState<Record<string, string>>({});

  const api = async (metodo: string, body: object, ok: string) => {
    setMsg(null);
    const r = await fetch('/api/usuarios', { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` }, body: JSON.stringify(body) });
    if (!r.ok) { setMsg({ t: await r.text(), error: true }); return false; }
    setMsg({ t: ok }); await recargar(); return true;
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (await api('POST', nuevo, `Usuario ${nuevo.email} creado. Pasale la contraseña por un canal privado: ${nuevo.password}`)) setNuevo({ email: '', nombre: '', rol: 'am', password: '' });
  };

  return (
    <Seccion id="usuarios" titulo="Usuarios">
      <p className="nota">Creá usuarios y poneles contraseña sin depender de emails. Las contraseñas no se pueden ver: solo se reemplazan por una nueva. Mínimo 10 caracteres.</p>
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      <Tabla>
        <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Nueva contraseña</th></tr></thead>
        <tbody>{perfiles.map((p) => (
          <tr key={p.id}>
            <td>{p.email}{p.id === yo.id && <span className="muted chico"> · vos</span>}</td>
            <td>{p.nombre ?? '–'}</td>
            <td><select className="sel" value={p.rol} disabled={p.id === yo.id} onChange={(e) => api('PATCH', { id: p.id, rol: e.target.value }, `Rol de ${p.email} actualizado.`)}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
            </select></td>
            <td className="acciones">
              <input type="text" autoComplete="off" placeholder="Nueva contraseña" value={claves[p.id] ?? ''} onChange={(e) => setClaves({ ...claves, [p.id]: e.target.value })} />
              <button className="btn" onClick={() => setClaves({ ...claves, [p.id]: generarClave() })}>Generar</button>
              <button className="btn primario" disabled={(claves[p.id] ?? '').length < 10} onClick={async () => { if (await api('PATCH', { id: p.id, password: claves[p.id] }, `Contraseña de ${p.email} actualizada. Pasásela por un canal privado.`)) setClaves({ ...claves, [p.id]: '' }); }}>Guardar</button>
            </td>
          </tr>
        ))}</tbody>
      </Tabla>
      <form className="panel controles" onSubmit={crear}>
        <label>Email<input type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
        <label>Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        <label>Rol<select className="sel" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}</select></label>
        <label>Contraseña<input type="text" autoComplete="off" required minLength={10} value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} /></label>
        <button type="button" className="btn" onClick={() => setNuevo({ ...nuevo, password: generarClave() })}>Generar</button>
        <button className="btn primario">Crear usuario</button>
      </form>
    </Seccion>
  );
}

/** Cambio de la propia contraseña: usa la sesión actual, sin email. */
export function MiClave({ cerrar }: { cerrar: () => void }) {
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (a.length < 10) return setMsg({ t: 'Mínimo 10 caracteres.', error: true });
    if (a !== b) return setMsg({ t: 'Las dos contraseñas no coinciden.', error: true });
    const { error } = await supabase.auth.updateUser({ password: a });
    if (error) setMsg({ t: error.message, error: true }); else { setMsg({ t: 'Contraseña actualizada.' }); setA(''); setB(''); }
  };
  return (
    <div className="modal-fondo" onClick={cerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h3>Cambiar mi contraseña</h3>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label>Repetila<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
        {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
        <div className="fila"><span className="sp" /><button type="button" className="btn" onClick={cerrar}>Cerrar</button><button className="btn primario">Guardar</button></div>
      </form>
    </div>
  );
}
