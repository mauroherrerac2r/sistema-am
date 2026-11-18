import { urlBase } from '../shared/url.js';
import { createClient } from '@supabase/supabase-js';
import { dbServidor } from './db.js';

/** Devuelve el usuario si el JWT es válido y tiene alguno de los roles pedidos; si no, null. */
export async function usuarioConRol(req: Request, roles: string[]) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!jwt) return null;
  const anon = createClient(urlBase(process.env.SUPABASE_URL), process.env.SUPABASE_ANON_KEY!.trim(), { auth: { persistSession: false } });
  const { data } = await anon.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: perfil } = await dbServidor().from('profiles').select('rol').eq('id', data.user.id).single();
  return perfil && roles.includes(perfil.rol) ? { id: data.user.id, rol: perfil.rol as string } : null;
}
