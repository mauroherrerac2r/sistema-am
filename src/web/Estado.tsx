// Fase 0: estado del conector. Muestra BMs, cuentas por cliente y últimas sincronizaciones.
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const fecha = (s?: string | null) => (s ? new Date(s).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const ESTADO_CUENTA: Record<number, string> = { 1: 'Activa', 2: 'Deshabilitada', 3: 'Sin pago', 7: 'En revisión', 8: 'Cerrándose', 9: 'Periodo de gracia', 100: 'Pendiente de cierre', 101: 'Cerrada' };

export function Estado({ sesion }: { sesion: Session }) {
  const [rol, setRol] = useState<string>('');
  const [bms, setBms] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    const [p, b, c, r] = await Promise.all([
      supabase.from('profiles').select('rol').eq('id', sesion.user.id).single(),
      supabase.from('business_managers_publico').select('*').order('nombre'),
      supabase.from('client_accounts').select('sede, activa, clients(nombre, slug), ad_accounts(id, nombre, moneda, estado_cuenta, bm_id, actualizado_en)').order('client_id'),
      supabase.from('sync_runs').select('*').order('iniciado_en', { ascending: false }).limit(15),
    ]);
    setRol(p.data?.rol ?? '');
    setBms(b.data ?? []); setCuentas(c.data ?? []); setRuns(r.data ?? []);
  }, [sesion.user.id]);

  useEffect(() => { cargar(); const t = setInterval(cargar, 30_000); return () => clearInterval(t); }, [cargar]);

  const sync = async (tipo: string) => {
    setMsg('Pidiendo sincronización…');
    const r = await fetch('/.netlify/functions/sync-manual', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` }, body: JSON.stringify({ tipo }),
    });
    setMsg(r.ok ? 'Sincronización en curso. Esta página se actualiza sola.' : `No se pudo: ${await r.text()}`);
    setTimeout(cargar, 3000);
  };

  return (
    <div className="pila">
      <section>
        <div className="fila"><h2>Business Managers</h2><span className="sp" />
          {rol === 'admin' && <>
            <button className="btn" onClick={() => sync('cuentas')}>Actualizar cuentas</button>
            <button className="btn" onClick={() => sync('hoy')}>Sincronizar hoy</button>
            <button className="btn" onClick={() => sync('historico')}>Sincronizar histórico</button>
          </>}
        </div>
        {msg && <p className="muted">{msg}</p>}
        {!bms.length && <p className="muted">Todavía no hay BMs cargados. Se agregan con <code>npm run bm:agregar</code>.</p>}
        <div className="tabla"><table>
          <thead><tr><th>BM</th><th>Usuario de sistema</th><th>Token</th><th>Último chequeo</th><th>Estado</th></tr></thead>
          <tbody>{bms.map((b) => (
            <tr key={b.id}><td>{b.nombre}</td><td>{b.system_user_nombre ?? '–'}</td><td>…{b.token_ultimos4}</td><td>{fecha(b.ultimo_chequeo)}</td>
              <td className={b.ultimo_error ? 'mal' : 'bien'}>{b.ultimo_error ?? (b.activo ? 'OK' : 'Inactivo')}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section>
        <h2>Cuentas configuradas</h2>
        {!cuentas.length && <p className="muted">Sin clientes cargados. Se importan del Sheet con <code>npm run config:importar</code>.</p>}
        <div className="tabla"><table>
          <thead><tr><th>Cliente</th><th>Sede</th><th>Cuenta</th><th>ID</th><th>Estado en Meta</th><th>Acceso</th></tr></thead>
          <tbody>{cuentas.map((c) => (
            <tr key={c.ad_accounts?.id}><td>{c.clients?.nombre}</td><td>{c.sede ?? '–'}</td><td>{c.ad_accounts?.nombre}</td><td>{c.ad_accounts?.id}</td>
              <td>{ESTADO_CUENTA[c.ad_accounts?.estado_cuenta] ?? '–'}</td>
              <td className={c.ad_accounts?.bm_id ? 'bien' : 'mal'}>{c.ad_accounts?.bm_id ? 'OK' : 'Ningún usuario de sistema la ve'}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section>
        <h2>Últimas sincronizaciones</h2>
        <div className="tabla"><table>
          <thead><tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Cuentas OK</th><th>Con error</th><th>Detalle</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}><td>{r.tipo}</td><td>{fecha(r.iniciado_en)}</td><td>{fecha(r.terminado_en)}</td>
              <td className={r.estado === 'ok' ? 'bien' : r.estado === 'corriendo' ? '' : 'mal'}>{r.estado}</td><td>{r.cuentas_ok}</td><td>{r.cuentas_error}</td>
              <td className="det">{(r.detalle?.errores ?? []).map((e: any) => `${e.objeto}: ${e.error}`).join(' · ') || '–'}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
