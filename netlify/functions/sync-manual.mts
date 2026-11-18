// Botón "Sincronizar ahora" de la app. Solo para usuarios con rol admin.
import { createClient } from '@supabase/supabase-js';
import { dbServidor } from '../../src/server/db.js';
import { dispararSync } from '../../src/server/disparar.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!jwt) return new Response('No autorizado', { status: 401 });
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: u } = await anon.auth.getUser(jwt);
  if (!u.user) return new Response('No autorizado', { status: 401 });
  const { data: perfil } = await dbServidor().from('profiles').select('rol').eq('id', u.user.id).single();
  if (perfil?.rol !== 'admin') return new Response('Solo admin', { status: 403 });
  const { tipo } = (await req.json().catch(() => ({}))) as { tipo?: 'cuentas' | 'historico' | 'hoy' };
  if (!tipo || !['cuentas', 'historico', 'hoy'].includes(tipo)) return new Response('tipo inválido', { status: 400 });
  await dispararSync(tipo);
  return Response.json({ ok: true });
};
