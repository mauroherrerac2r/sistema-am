// Alta y baja de Business Managers desde la app. Solo admin.
// El token viaja una sola vez por HTTPS, se valida contra Meta, se cifra y nunca vuelve al navegador.
import { usuarioConRol } from '../../src/server/auth.js';
import { dbServidor } from '../../src/server/db.js';
import { cifrar } from '../../src/server/crypto.js';
import { MetaClient, MetaError } from '../../src/server/meta/client.js';
import { identidad, cuentasDelToken } from '../../src/server/meta/sync.js';
import { dispararSync } from '../../src/server/disparar.js';

export default async (req: Request) => {
  if (!(await usuarioConRol(req, ['admin']))) return new Response('Solo admin', { status: 403 });
  const db = dbServidor();
  const body = (await req.json().catch(() => ({}))) as any;

  if (req.method === 'POST') {
    const nombre = String(body.nombre || '').trim();
    const token = String(body.token || '').trim();
    if (!nombre || token.length < 50) return new Response('Faltan el nombre o un token válido', { status: 400 });
    try {
      const meta = new MetaClient({ token, maxReintentos: 1 });
      const yo = await identidad(meta);
      const cuentas = await cuentasDelToken(meta);
      const { error } = await db.from('business_managers').insert({
        nombre, business_id: body.business_id ? String(body.business_id).trim() : null,
        token_cifrado: cifrar(token), token_ultimos4: token.slice(-4),
        system_user_id: yo.id, system_user_nombre: yo.name, ultimo_chequeo: new Date().toISOString(),
      });
      if (error) return new Response(error.message, { status: 500 });
      await dispararSync('cuentas').catch(() => {});
      return Response.json({ usuario: yo.name, cuentas: cuentas.length });
    } catch (e: any) {
      const msg = e instanceof MetaError && e.esToken ? 'Meta rechazó el token: revisá que esté copiado completo y que no haya vencido.' : `Meta respondió: ${e.message}`;
      return new Response(msg, { status: 400 });
    }
  }

  if (req.method === 'PATCH') {
    const { error } = await db.from('business_managers').update({ activo: Boolean(body.activo) }).eq('id', String(body.id));
    return error ? new Response(error.message, { status: 500 }) : Response.json({ ok: true });
  }

  return new Response('Método no permitido', { status: 405 });
};

export const config = { path: '/api/bm' };
