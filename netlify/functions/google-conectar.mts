// Inicia la conexión con Google Drive (solo admin): devuelve la URL de autorización de Google.
import { usuarioConRol } from '../../src/server/auth.js';
import { firmarEstado, urlAutorizacion } from '../../src/server/google.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const u = await usuarioConRol(req, ['admin']);
  if (!u) return new Response('Solo admin', { status: 403 });
  try { return Response.json({ url: urlAutorizacion(firmarEstado(u.id)) }); }
  catch (e: any) { return new Response(e.message, { status: 400 }); }
};

export const config = { path: '/api/google/conectar' };
