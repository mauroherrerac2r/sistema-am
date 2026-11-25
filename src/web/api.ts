import { supabase } from './supabase';

/** POST a una función propia con la sesión del usuario. Devuelve el JSON o tira el texto de error. */
export async function apiPost<T = any>(ruta: string, body: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(ruta, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.text()) || `Error ${r.status}`);
  return r.json();
}

export interface ArchivoCarpeta { nombre: string; tipo: string; modificado: string; link: string }

export const documentosDeCliente = (cliente_id: string) =>
  apiPost<{ archivos: ArchivoCarpeta[]; noLegibles?: string[]; sinCarpeta?: boolean }>('/api/drive', { accion: 'carpeta', cliente_id });

export const leerSheetDrive = (url: string) => apiPost<{ titulo: string; pestana: string; texto: string }>('/api/drive', { accion: 'sheet', url });

export const tipoDoc = (t: string) => (t.includes('document') ? 'Documento' : t.includes('spreadsheet') ? 'Planilla' : t.includes('pdf') ? 'PDF' : 'Texto');

/** ID de una carpeta o archivo de Drive a partir del link (o el ID solo). */
export function idDrive(link: string): string | null {
  const t = link.trim();
  const m = t.match(/\/(?:folders|d)\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || t.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : null;
}
