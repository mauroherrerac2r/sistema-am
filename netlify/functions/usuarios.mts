// Administración de usuarios desde la app (solo admin), sin depender de emails.
// Usa la Secret key de Supabase en el servidor; nunca llega al navegador.
import { usuarioConRol } from '../../src/server/auth.js';
import { dbServidor } from '../../src/server/db.js';
import { randomBytes } from 'node:crypto';

const ROLES = ['admin', 'am', 'pm'];
const claveValida = (p: unknown) => typeof p === 'string' && p.length >= 10;

export default async (req: Request) => {
  const admin = await usuarioConRol(req, ['admin']);
  if (!admin) return new Response('Solo admin', { status: 403 });
  const db = dbServidor();
  const b = (await req.json().catch(() => ({}))) as any;

  if (req.method === 'POST') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response('Email inválido', { status: 400 });
    // Sin contraseña: entra con Google. Se le pone una al azar que nadie conoce.
    const password = b.password ? String(b.password) : randomBytes(24).toString('base64url');
    if (!claveValida(password)) return new Response('La contraseña necesita al menos 10 caracteres', { status: 400 });
    if (!ROLES.includes(b.rol)) return new Response('Rol inválido', { status: 400 });
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return new Response(error.message.includes('already') ? 'Ya existe un usuario con ese email' : error.message, { status: 400 });
    await db.from('profiles').upsert({ id: data.user.id, email, nombre: String(b.nombre || '').trim() || null, rol: b.rol });
    return Response.json({ id: data.user.id });
  }

  if (req.method === 'PATCH') {
    const id = String(b.id || '');
    if (!id) return new Response('Falta el usuario', { status: 400 });
    if (b.password !== undefined) {
      if (!claveValida(b.password)) return new Response('La contraseña necesita al menos 10 caracteres', { status: 400 });
      const { error } = await db.auth.admin.updateUserById(id, { password: b.password });
      if (error) return new Response(error.message, { status: 400 });
    }
    if (b.rol !== undefined || b.nombre !== undefined) {
      if (b.rol !== undefined && !ROLES.includes(b.rol)) return new Response('Rol inválido', { status: 400 });
      if (id === admin.id && b.rol !== undefined && b.rol !== 'admin') return new Response('No podés quitarte el rol de admin a vos mismo', { status: 400 });
      const cambios: any = {};
      if (b.rol !== undefined) cambios.rol = b.rol;
      if (b.nombre !== undefined) cambios.nombre = String(b.nombre).trim() || null;
      const { error } = await db.from('profiles').update(cambios).eq('id', id);
      if (error) return new Response(error.message, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  return new Response('Método no permitido', { status: 405 });
};

export const config = { path: '/api/usuarios' };
