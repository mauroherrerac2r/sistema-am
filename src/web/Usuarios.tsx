// Usuarios: alta y rol (solo admin). Todos entran con Google de la organización.
import { FormEvent, useState } from 'react';
import { useApp } from './contexto';
import { Aviso, Seccion, Tabla } from './ui';

const ROLES = [{ v: 'admin', t: 'Admin' }, { v: 'am', t: 'Account Manager' }, { v: 'pm', t: 'Paid Media' }];

export function AdminUsuarios() {
  const { perfiles, sesion, yo, recargar } = useApp();
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'am', password: '' });

  const api = async (metodo: string, body: object, ok: string) => {
    setMsg(null);
    const r = await fetch('/api/usuarios', { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` }, body: JSON.stringify(body) });
    if (!r.ok) { setMsg({ t: await r.text(), error: true }); return false; }
    setMsg({ t: ok }); await recargar(); return true;
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    const ok = `Usuario ${nuevo.email} creado. Ya puede entrar con Google.`;
    if (await api('POST', nuevo, ok)) setNuevo({ email: '', nombre: '', rol: 'am', password: '' });
  };

  return (
    <Seccion id="usuarios" titulo="Usuarios">
      <p className="nota">Dá de alta a cada persona con su email de Google de la organización: entra con el botón "Entrar con Google", sin contraseña.</p>
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      <Tabla>
        <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th></tr></thead>
        <tbody>{perfiles.map((p) => (
          <tr key={p.id}>
            <td>{p.email}{p.id === yo.id && <span className="muted chico"> · vos</span>}</td>
            <td>{p.nombre ?? '–'}</td>
            <td><select className="sel" value={p.rol} disabled={p.id === yo.id} onChange={(e) => api('PATCH', { id: p.id, rol: e.target.value }, `Rol de ${p.email} actualizado.`)}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
            </select></td>
          </tr>
        ))}</tbody>
      </Tabla>
      <form className="panel controles" onSubmit={crear}>
        <label>Email<input type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
        <label>Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        <label>Rol<select className="sel" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}</select></label>
        <button className="btn primario">Crear usuario</button>
      </form>
    </Seccion>
  );
}
