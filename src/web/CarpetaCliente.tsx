// Carpeta de Google Drive de un cliente: lo que la IA lee antes de cada análisis.
import { useState } from 'react';
import type { Cliente } from './datos';
import { supabase } from './supabase';
import { documentosDeCliente, idDrive, tipoDoc, ArchivoCarpeta } from './api';
import { Aviso } from './ui';

export function CarpetaCliente({ cliente, alGuardar }: { cliente: Cliente; alGuardar: () => Promise<void> }) {
  const [link, setLink] = useState(cliente.drive_carpeta_id ? `https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}` : '');
  const [docs, setDocs] = useState<{ archivos: ArchivoCarpeta[]; noLegibles?: string[] } | null>(null);
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null);
  const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    const id = link.trim() ? idDrive(link) : null;
    if (link.trim() && !id) return setMsg({ t: 'No reconozco ese link. Copiá la dirección de la carpeta desde Google Drive.', error: true });
    const { error } = await supabase.from('clients').update({ drive_carpeta_id: id }).eq('id', cliente.id);
    if (error) return setMsg({ t: error.message, error: true });
    setMsg({ t: id ? 'Carpeta guardada. Tocá "Ver documentos" para confirmar que la IA puede leerla.' : 'Carpeta quitada.' });
    setDocs(null);
    await alGuardar();
  };

  const ver = async () => {
    setCargando(true); setMsg(null);
    try { setDocs(await documentosDeCliente(cliente.id)); } catch (e: any) { setMsg({ t: e.message, error: true }); }
    setCargando(false);
  };

  const cambiado = (idDrive(link) ?? null) !== (cliente.drive_carpeta_id ?? null) && !(link.trim() === '' && !cliente.drive_carpeta_id);

  return (
    <div className="carpeta">
      <div className="controles">
        <label className="largo">Carpeta de Google Drive (contexto para la IA)
          <input value={link} placeholder="https://drive.google.com/drive/folders/…" onChange={(e) => setLink(e.target.value)} />
        </label>
        <button className="btn primario" disabled={!cambiado} onClick={guardar}>Guardar carpeta</button>
        {cliente.drive_carpeta_id && <button className="btn" disabled={cargando} onClick={ver}>{cargando ? 'Leyendo…' : 'Ver documentos'}</button>}
      </div>
      {msg && <Aviso tipo={msg.error ? 'error' : 'info'}>{msg.t}</Aviso>}
      {docs && (
        docs.archivos.length ? (
          <ul className="docs">
            {docs.archivos.map((d, i) => (
              <li key={d.link}><a href={d.link} target="_blank" rel="noopener noreferrer">{d.nombre}</a> <span className="muted chico">· {tipoDoc(d.tipo)} · {new Date(d.modificado).toLocaleDateString('es-AR')}{i === 0 && /contexto|ficha|brief/i.test(d.nombre) ? ' · se lee primero' : ''}</span></li>
            ))}
            {!!docs.noLegibles?.length && <li className="muted chico">No se leen (formato no soportado): {docs.noLegibles.join(', ')}</li>}
          </ul>
        ) : <p className="muted">La carpeta está vacía o no tiene documentos legibles (Docs, Sheets, PDF o texto).</p>
      )}
    </div>
  );
}
