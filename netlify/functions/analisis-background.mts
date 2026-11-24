// Genera el análisis con Claude (puede tardar 1–3 minutos) y lo guarda.
import { dbServidor } from '../../src/server/db.js';
import { generarAnalisis } from '../../src/server/ia.js';

export default async (req: Request) => {
  if (req.headers.get('x-sync-secret') !== process.env.SYNC_SECRET) return new Response('No autorizado', { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response('Falta id', { status: 400 });
  const db = dbServidor();
  const { data: a } = await db.from('analisis_ia').select('id,tipo,entrada,contexto,estado').eq('id', id).single();
  if (!a || a.estado !== 'generando') return new Response('Nada que hacer');
  try {
    const r = await generarAnalisis(a.tipo, a.entrada, null);
    await db.from('analisis_ia').update({ estado: 'listo', contenido: r.texto, modelo: r.modelo, tokens_entrada: r.tokens_entrada, tokens_salida: r.tokens_salida, terminado_en: new Date().toISOString() }).eq('id', id);
  } catch (e: any) {
    await db.from('analisis_ia').update({ estado: 'error', error: String(e?.message || e).slice(0, 1000), terminado_en: new Date().toISOString() }).eq('id', id);
  }
  return new Response('ok');
};
