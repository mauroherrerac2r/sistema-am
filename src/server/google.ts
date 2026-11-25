// Conector de lectura con Google Drive y Sheets (solo lectura), con la cuenta que conecta un admin.
// Usa el mismo cliente OAuth del login. El refresh token se guarda cifrado en `integraciones`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cifrar, descifrar } from './crypto.js';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'openid', 'email'];
const redirectUri = () => `${process.env.URL}/api/google/callback`;

function credenciales() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim(), secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables de Netlify.');
  return { id, secret };
}

// ---------------- Estado firmado (evita que otro sitio complete la conexión) ----------------

export function firmarEstado(usuario: string, ahora = Date.now()): string {
  const datos = `${usuario}.${ahora}`;
  const firma = createHmac('sha256', process.env.SYNC_SECRET || '').update(datos).digest('base64url');
  return `${datos}.${firma}`;
}

export function verificarEstado(estado: string, ahora = Date.now()): string | null {
  const [usuario, ts, firma] = estado.split('.');
  if (!usuario || !ts || !firma) return null;
  const esperada = createHmac('sha256', process.env.SYNC_SECRET || '').update(`${usuario}.${ts}`).digest('base64url');
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (ahora - Number(ts) > 10 * 60_000) return null; // 10 minutos
  return usuario;
}

export function urlAutorizacion(estado: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: credenciales().id, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado,
  }).toString();
  return u.toString();
}

async function token(params: Record<string, string>) {
  const { id, secret } = credenciales();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `Google respondió ${r.status}`);
  return j as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
}

export async function canjearCodigo(db: SupabaseClient, code: string, usuario: string) {
  const t = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error('Google no devolvió acceso permanente. Probá desconectar la app en tu cuenta de Google y conectar de nuevo.');
  if (!(t.scope || '').includes('drive.readonly')) throw new Error('No se otorgó el permiso de lectura de Drive. Volvé a conectar y aceptá el permiso.');
  const email = t.id_token ? JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email : null;
  const { error } = await db.from('integraciones').upsert({ id: 'google_drive', token_cifrado: cifrar(t.refresh_token), cuenta_email: email, conectado_por: usuario, conectado_en: new Date().toISOString(), ultimo_error: null });
  if (error) throw new Error(error.message);
  return email as string | null;
}

/** Cliente de lectura listo para usar, o error claro si Drive no está conectado. */
export async function driveCliente(db: SupabaseClient) {
  const { data } = await db.from('integraciones').select('token_cifrado').eq('id', 'google_drive').maybeSingle();
  if (!data) throw new Error('Google Drive no está conectado. Un admin tiene que conectarlo en Sistema → Integraciones.');
  let acceso: string;
  try { acceso = (await token({ refresh_token: descifrar(data.token_cifrado), grant_type: 'refresh_token' })).access_token; }
  catch (e: any) {
    await db.from('integraciones').update({ ultimo_error: e.message }).eq('id', 'google_drive');
    throw new Error(`La conexión con Google Drive venció o fue revocada (${e.message}). Un admin tiene que reconectarla.`);
  }
  const get = async (url: string, binario = false) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${acceso}` } });
    if (!r.ok) {
      const j: any = await r.json().catch(() => ({}));
      const m = j.error?.message || `HTTP ${r.status}`;
      throw new Error(r.status === 404 ? 'No se encontró el archivo o la carpeta, o la cuenta conectada no tiene acceso.' : m);
    }
    return binario ? Buffer.from(await r.arrayBuffer()) : r;
  };
  return { get };
}

// ---------------- Links ----------------

/** Extrae el ID de un link de Drive/Docs/Sheets (o acepta el ID solo) y el gid de la pestaña. */
export function idDeLink(link: string): { id: string; gid: string | null } | null {
  const t = link.trim();
  const m = t.match(/\/(?:folders|d)\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || t.match(/^([A-Za-z0-9_-]{10,})$/);
  if (!m) return null;
  const g = t.match(/[#&?]gid=(\d+)/);
  return { id: m[1], gid: g ? g[1] : null };
}

// ---------------- Carpetas y documentos ----------------

export interface ArchivoDrive { id: string; nombre: string; tipo: string; modificado: string; tamano: number | null; link: string }

const LEGIBLES = new Set([
  'application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
]);

export async function listarCarpeta(drive: Awaited<ReturnType<typeof driveCliente>>, carpeta: string): Promise<ArchivoDrive[]> {
  const q = encodeURIComponent(`'${carpeta.replace(/'/g, '')}' in parents and trashed = false`);
  const campos = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken');
  const out: ArchivoDrive[] = [];
  let pagina = '';
  for (let i = 0; i < 5; i++) {
    const r: any = await (await drive.get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${campos}&pageSize=200&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true${pagina ? `&pageToken=${pagina}` : ''}`) as Response).json();
    out.push(...(r.files || []).map((f: any) => ({ id: f.id, nombre: f.name, tipo: f.mimeType, modificado: f.modifiedTime, tamano: f.size ? Number(f.size) : null, link: f.webViewLink })));
    if (!r.nextPageToken) break;
    pagina = r.nextPageToken;
  }
  return out;
}

export const esLegible = (a: ArchivoDrive) => LEGIBLES.has(a.tipo);

/** La ficha de contexto primero; después lo más reciente. */
export function priorizar(archivos: ArchivoDrive[]): ArchivoDrive[] {
  const ficha = (a: ArchivoDrive) => (/contexto|ficha|brief/i.test(a.nombre) ? 0 : 1);
  return archivos.filter(esLegible).sort((a, b) => ficha(a) - ficha(b) || b.modificado.localeCompare(a.modificado));
}

export type Contenido = { tipo: 'texto'; texto: string } | { tipo: 'pdf'; base64: string };

export async function leerArchivo(drive: Awaited<ReturnType<typeof driveCliente>>, a: ArchivoDrive): Promise<Contenido | null> {
  const base = `https://www.googleapis.com/drive/v3/files/${a.id}`;
  if (a.tipo === 'application/vnd.google-apps.document') return { tipo: 'texto', texto: (await drive.get(`${base}/export?mimeType=text/plain`, true) as Buffer).toString('utf8') };
  if (a.tipo === 'application/vnd.google-apps.spreadsheet') return { tipo: 'texto', texto: (await drive.get(`${base}/export?mimeType=text/csv`, true) as Buffer).toString('utf8') };
  if (a.tipo === 'application/pdf') {
    if ((a.tamano ?? 0) > 8_000_000) return null; // PDFs muy pesados quedan afuera
    return { tipo: 'pdf', base64: (await drive.get(`${base}?alt=media&supportsAllDrives=true`, true) as Buffer).toString('base64') };
  }
  return { tipo: 'texto', texto: (await drive.get(`${base}?alt=media&supportsAllDrives=true`, true) as Buffer).toString('utf8') };
}

export interface DocumentoLeido { nombre: string; modificado: string; link: string; contenido: Contenido; recortado: boolean }

/** Lee los documentos de una carpeta con tope de tamaño total, para que el análisis no se vuelva caro. */
export async function leerCarpeta(drive: Awaited<ReturnType<typeof driveCliente>>, carpeta: string, topeTexto = 160_000, maxPdfs = 3): Promise<{ leidos: DocumentoLeido[]; omitidos: string[] }> {
  const archivos = priorizar(await listarCarpeta(drive, carpeta));
  const leidos: DocumentoLeido[] = [], omitidos: string[] = [];
  let usado = 0, pdfs = 0;
  for (const a of archivos) {
    if (a.tipo === 'application/pdf' && pdfs >= maxPdfs) { omitidos.push(a.nombre); continue; }
    if (usado >= topeTexto && a.tipo !== 'application/pdf') { omitidos.push(a.nombre); continue; }
    try {
      const c = await leerArchivo(drive, a);
      if (!c) { omitidos.push(a.nombre); continue; }
      let recortado = false;
      if (c.tipo === 'texto') {
        const disponible = Math.min(50_000, topeTexto - usado);
        if (c.texto.length > disponible) { c.texto = c.texto.slice(0, disponible); recortado = true; }
        usado += c.texto.length;
      } else pdfs++;
      leidos.push({ nombre: a.nombre, modificado: a.modificado, link: a.link, contenido: c, recortado });
    } catch { omitidos.push(a.nombre); }
  }
  return { leidos, omitidos };
}

// ---------------- Sheets ----------------

/** Devuelve la pestaña pedida (gid) o la primera, como texto separado por tabs. */
export async function leerSheet(drive: Awaited<ReturnType<typeof driveCliente>>, link: string): Promise<{ titulo: string; pestana: string; texto: string }> {
  const ref = idDeLink(link);
  if (!ref) throw new Error('No reconozco ese link de Google Sheets.');
  const meta: any = await (await drive.get(`https://sheets.googleapis.com/v4/spreadsheets/${ref.id}?fields=properties.title,sheets.properties(sheetId,title)`) as Response).json();
  const hojas: { sheetId: number; title: string }[] = (meta.sheets || []).map((s: any) => s.properties);
  const hoja = (ref.gid != null && hojas.find((h) => String(h.sheetId) === ref.gid)) || hojas[0];
  if (!hoja) throw new Error('La planilla no tiene pestañas.');
  const rango = encodeURIComponent(`'${hoja.title.replace(/'/g, "''")}'`);
  const v: any = await (await drive.get(`https://sheets.googleapis.com/v4/spreadsheets/${ref.id}/values/${rango}?valueRenderOption=FORMATTED_VALUE`) as Response).json();
  const filas: string[][] = v.values || [];
  const texto = filas.map((f) => f.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  return { titulo: meta.properties?.title ?? '', pestana: hoja.title, texto };
}
