// Administración: Business Managers, sincronización y registro. Solo admin.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useApp } from './contexto';
import { supabase } from './supabase';
import { Aviso, Seccion, Tabla } from './ui';
import { ESTADO_CUENTA } from './reglas';
import { AdminUsuarios } from './Usuarios';

const fecha = (s?: string | null) => (s ? new Date(s).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const TIPO: Record<string, string> = { cuentas: 'Cuentas', historico: 'Histórico', hoy: 'Hoy' };

export function Sistema() {
  const { sesion, cuentasMeta, cuentasCfg, recargar } = useApp();
  const [bms, setBms] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [form, setForm] = useState({ nombre: '', business_id: '', token: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const [b, r] = await Promise.all([
      supabase.from('business_managers_publico').select('*').order('nombre'),
      supabase.from('sync_runs').select('*').order('iniciado_en', { ascending: false }).limit(20),
    ]);
    setBms(b.data ?? []); setRuns(r.data ?? []);
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 20_000); return () => clearInterval(t); }, [cargar]);

  const api = (ruta: string, metodo: string, body: object) => fetch(ruta, {
    method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` }, body: JSON.stringify(body),
  });

  const sync = async (tipo: string) => {
    const r = await api('/.netlify/functions/sync-manual', 'POST', { tipo });
    setMsg(r.ok ? { t: 'Sincronización en curso. El registro de abajo se actualiza solo.' } : { t: await r.text(), error: true });
    setTimeout(cargar, 3000);
  };

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setMsg(null);
    const r = await api('/api/bm', 'POST', form);
    setEnviando(false);
    if (r.ok) {
      const d = await r.json();
      setMsg({ t: `BM conectado: el usuario de sistema "${d.usuario}" ve ${d.cuentas} cuentas. Ya se está actualizando el listado.` });
      setForm({ nombre: '', business_id: '', token: '' });
      setTimeout(() => { cargar(); recargar(); }, 5000);
    } else setMsg({ t: await r.text(), error: true });
  };

  const activar = async (id: string, activo: boolean) => {
    const r = await api('/api/bm', 'PATCH', { id, activo });
    if (!r.ok) setMsg({ t: await r.text(), error: true });
    cargar();
  };

  const asignadas = new Set(cuentasCfg.map((c) => c.ad_account_id));
  const visibles = cuentasMeta.filter((c) => c.bm_id);

  return (
    <div className="pila">
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}

      <AdminUsuarios />

      <Seccion id="bms" titulo="Business Managers" extra={<>
        <button className="btn" onClick={() => sync('cuentas')}>Actualizar cuentas</button>
        <button className="btn" onClick={() => sync('hoy')}>Sincronizar hoy</button>
        <button className="btn" onClick={() => sync('historico')}>Sincronizar histórico</button>
      </>}>
        <Tabla>
          <thead><tr><th>BM</th><th>Usuario de sistema</th><th>Token</th><th>Último chequeo</th><th>Estado</th><th /></tr></thead>
          <tbody>{bms.map((b) => (
            <tr key={b.id} className={b.activo ? '' : 'r-inactiva'}>
              <td>{b.nombre}</td><td>{b.system_user_nombre ?? '–'}</td><td>…{b.token_ultimos4}</td><td>{fecha(b.ultimo_chequeo)}</td>
              <td className={b.ultimo_error ? 'mal' : 'bien'}>{b.ultimo_error ?? (b.activo ? 'OK' : 'Desactivado')}</td>
              <td><button className="btn" onClick={() => activar(b.id, !b.activo)}>{b.activo ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          ))}</tbody>
        </Tabla>
        <form className="panel controles" onSubmit={agregar}>
          <label>Nombre del BM<input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: BM Clic2Ring" /></label>
          <label>ID del BM (opcional)<input value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })} /></label>
          <label className="largo">Token del usuario de sistema<input required type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="EAAB…" /></label>
          <button className="btn primario" disabled={enviando}>{enviando ? 'Verificando con Meta…' : 'Conectar BM'}</button>
          <p className="nota">El token se verifica contra Meta, se guarda cifrado y no se vuelve a mostrar. Permisos necesarios: ads_read y business_management, sin vencimiento.</p>
        </form>
      </Seccion>

      <Seccion id="cuentas" titulo={`Cuentas visibles (${visibles.length})`}>
        <p className="nota">Todas las cuentas que ven los usuarios de sistema. Solo las asignadas a un cliente se sincronizan en detalle.</p>
        <Tabla>
          <thead><tr><th>Cuenta</th><th>ID</th><th>Moneda</th><th>Zona</th><th>Estado en Meta</th><th>Cliente</th></tr></thead>
          <tbody>{visibles.map((c) => (
            <tr key={c.id}><td>{c.nombre}</td><td>{c.id}</td><td>{c.moneda}</td><td>{c.zona_horaria}</td>
              <td className={c.estado_cuenta === 1 ? '' : 'mal'}>{ESTADO_CUENTA[c.estado_cuenta ?? -1] ?? '–'}</td>
              <td className={asignadas.has(c.id) ? 'bien' : 'muted'}>{asignadas.has(c.id) ? 'Asignada' : 'Sin asignar'}</td></tr>
          ))}</tbody>
        </Tabla>
      </Seccion>

      <Seccion id="runs" titulo="Últimas sincronizaciones">
        <Tabla>
          <thead><tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th className="d">OK</th><th className="d">Con error</th><th>Detalle</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}><td>{TIPO[r.tipo] ?? r.tipo}</td><td>{fecha(r.iniciado_en)}</td><td>{fecha(r.terminado_en)}</td>
              <td className={r.estado === 'ok' ? 'bien' : r.estado === 'corriendo' ? '' : 'mal'}>{r.estado}</td><td className="d">{r.cuentas_ok}</td><td className="d">{r.cuentas_error}</td>
              <td className="motivo">{(r.detalle?.errores ?? []).map((e: any) => `${e.objeto}: ${e.error}`).join(' · ') || '–'}</td></tr>
          ))}</tbody>
        </Tabla>
      </Seccion>
    </div>
  );
}
