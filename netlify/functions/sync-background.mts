// Función de fondo (hasta 15 min). La disparan los cron y el botón de admin.
import type { Context } from '@netlify/functions';
import { dbServidor } from '../../src/server/db.js';
import { correr, TipoSync } from '../../src/server/jobs.js';

export default async (req: Request, _ctx: Context) => {
  if (req.headers.get('x-sync-secret') !== process.env.SYNC_SECRET) return new Response('No autorizado', { status: 401 });
  const { tipo } = (await req.json().catch(() => ({}))) as { tipo?: TipoSync };
  if (!tipo || !['cuentas', 'historico', 'hoy'].includes(tipo)) return new Response('tipo inválido', { status: 400 });
  await correr(dbServidor(), tipo);
  return new Response('ok');
};
