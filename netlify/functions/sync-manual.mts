// Botón "Sincronizar ahora" de la app. Solo admin.
import { usuarioConRol } from '../../src/server/auth.js';
import { dispararSync } from '../../src/server/disparar.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  if (!(await usuarioConRol(req, ['admin']))) return new Response('Solo admin', { status: 403 });
  const { tipo } = (await req.json().catch(() => ({}))) as { tipo?: 'cuentas' | 'historico' | 'hoy' };
  if (!tipo || !['cuentas', 'historico', 'hoy'].includes(tipo)) return new Response('tipo inválido', { status: 400 });
  await dispararSync(tipo);
  return Response.json({ ok: true });
};
