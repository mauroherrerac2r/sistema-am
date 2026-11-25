// Conexión con Google Drive: la app lee carpetas de clientes y Sheets con la cuenta que conecte un admin.
import { useEffect, useState } from 'react';
import { estadoDrive } from './datos';
import { apiPost } from './api';
import { Aviso, Seccion } from './ui';

export function IntegracionDrive() {
  const [estado, setEstado] = useState<Awaited<ReturnType<typeof estadoDrive>> | undefined>(undefined);
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);

  useEffect(() => {
    // Vuelta desde Google: ?drive=ok|error
    const q = new URLSearchParams(location.search);
    if (q.get('drive') === 'ok') setMsg({ t: `Google Drive conectado${q.get('cuenta') ? ` con ${q.get('cuenta')}` : ''}.` });
    if (q.get('drive') === 'error') setMsg({ t: `No se pudo conectar Google Drive: ${q.get('motivo') || 'error desconocido'}`, error: true });
    if (q.get('drive')) history.replaceState(null, '', location.pathname + location.hash);
    estadoDrive().then(setEstado).catch(() => setEstado(null));
  }, []);

  const conectar = async () => {
    setMsg(null);
    try { const { url } = await apiPost<{ url: string }>('/api/google/conectar', {}); location.href = url; }
    catch (e: any) { setMsg({ t: e.message, error: true }); }
  };

  return (
    <Seccion id="integraciones" titulo="Integraciones">
      <div className="panel integracion">
        <div className="fila">
          <div>
            <h3>Google Drive y Sheets</h3>
            <p className="nota">Permite que la IA lea la carpeta de cada cliente (ficha de contexto, transcripciones de Meet, propuestas) y cargar ventas o clientes desde un Google Sheet. Solo lectura.</p>
          </div>
          <span className="sp" />
          <button className="btn primario" onClick={conectar}>{estado ? 'Reconectar' : 'Conectar Google Drive'}</button>
        </div>
        {estado === undefined ? <p className="muted">Revisando…</p> : estado ? (
          <p className={estado.ultimo_error ? 'mal' : 'bien'}>{estado.ultimo_error ? `Con error: ${estado.ultimo_error}` : `Conectado con ${estado.cuenta_email ?? 'la cuenta de la organización'} desde el ${new Date(estado.conectado_en).toLocaleDateString('es-AR')}.`}</p>
        ) : <p className="muted">Sin conectar.</p>}
        <p className="nota">La IA solo puede leer las carpetas a las que tiene acceso la cuenta que conecta. Conviene que sea una cuenta que vea todas las carpetas de clientes.</p>
        {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      </div>
    </Seccion>
  );
}
