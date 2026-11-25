// Google vuelve acá después de autorizar. Guarda el acceso cifrado y vuelve a la app.
import { dbServidor } from '../../src/server/db.js';
import { canjearCodigo, verificarEstado } from '../../src/server/google.js';

export default async (req: Request) => {
  const u = new URL(req.url);
  const volver = (q: string) => Response.redirect(`${process.env.URL}/?${q}#sistema`, 302);
  if (u.searchParams.get('error')) return volver(`drive=error&motivo=${encodeURIComponent(u.searchParams.get('error')!)}`);
  const usuario = verificarEstado(u.searchParams.get('state') || '');
  const code = u.searchParams.get('code');
  if (!usuario || !code) return volver('drive=error&motivo=' + encodeURIComponent('El pedido venció o no es válido. Probá conectar de nuevo.'));
  const db = dbServidor();
  const { data: perfil } = await db.from('profiles').select('rol').eq('id', usuario).single();
  if (perfil?.rol !== 'admin') return volver('drive=error&motivo=' + encodeURIComponent('Solo un admin puede conectar Drive.'));
  try {
    const email = await canjearCodigo(db, code, usuario);
    return volver(`drive=ok&cuenta=${encodeURIComponent(email || '')}`);
  } catch (e: any) { return volver('drive=error&motivo=' + encodeURIComponent(e.message)); }
};

export const config = { path: '/api/google/callback' };
