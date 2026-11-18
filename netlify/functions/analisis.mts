// Pide un análisis con IA: registra el pedido y lo deriva a la función de fondo.
import { usuarioConRol } from '../../src/server/auth.js';
import { dbServidor } from '../../src/server/db.js';
import { dispararFondo } from '../../src/server/disparar.js';
import { MODELO } from '../../src/server/ia.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const u = await usuarioConRol(req, ['admin', 'am', 'pm']);
  if (!u) return new Response('No autorizado', { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('Falta cargar ANTHROPIC_API_KEY en las variables de Netlify.', { status: 400 });
  const b = (await req.json().catch(() => ({}))) as any;
  if (!b.carga_id || !['cliente', 'paid'].includes(b.tipo) || !b.entrada) return new Response('Pedido incompleto', { status: 400 });
  const json = JSON.stringify(b.entrada);
  if (json.length > 400_000) return new Response('Demasiados datos para un análisis: acotá el período.', { status: 400 });
  const db = dbServidor();
  const { data, error } = await db.from('analisis_ia').insert({
    carga_id: b.carga_id, tipo: b.tipo, contexto: b.contexto ? String(b.contexto).slice(0, 2000) : null,
    entrada: b.entrada, modelo: MODELO, creado_por: u.id,
  }).select('id').single();
  if (error) return new Response(error.message, { status: 500 });
  try { await dispararFondo('analisis-background', { id: data.id }); }
  catch (e: any) {
    await db.from('analisis_ia').update({ estado: 'error', error: e.message, terminado_en: new Date().toISOString() }).eq('id', data.id);
    return new Response(e.message, { status: 500 });
  }
  return Response.json({ id: data.id });
};

export const config = { path: '/api/analisis' };
