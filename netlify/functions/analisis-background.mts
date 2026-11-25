// Genera el análisis con Claude (puede tardar 1–4 minutos) y lo guarda.
// Antes de escribir, la IA lee la carpeta de Drive del cliente y sus últimos análisis.
import { dbServidor } from '../../src/server/db.js';
import { generarAnalisis, type Extras } from '../../src/server/ia.js';
import { driveCliente, leerCarpeta } from '../../src/server/google.js';

export default async (req: Request) => {
  if (req.headers.get('x-sync-secret') !== process.env.SYNC_SECRET) return new Response('No autorizado', { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return new Response('Falta id', { status: 400 });
  const db = dbServidor();
  const { data: a } = await db.from('analisis_ia').select('id,tipo,entrada,contexto,estado,carga_id, ventas_cargas(client_id, clients(drive_carpeta_id))').eq('id', id).single();
  if (!a || a.estado !== 'generando') return new Response('Nada que hacer');
  const carga: any = (a as any).ventas_cargas;
  const fuentes: { documentos: string[]; omitidos: string[]; anteriores: string[]; aviso?: string } = { documentos: [], omitidos: [], anteriores: [] };
  const extras: Extras = {};
  try {
    // 1) Documentos de la carpeta del cliente (si tiene carpeta y Drive está conectado).
    const carpeta = carga?.clients?.drive_carpeta_id;
    if (carpeta) {
      try {
        const { leidos, omitidos } = await leerCarpeta(await driveCliente(db), carpeta);
        extras.documentos = leidos;
        fuentes.documentos = leidos.map((d) => d.nombre + (d.recortado ? ' (recortado)' : ''));
        fuentes.omitidos = omitidos;
      } catch (e: any) { fuentes.aviso = `No se pudo leer la carpeta de Drive: ${e.message}`; }
    }
    // 2) Últimos análisis del mismo cliente (memoria).
    if (carga?.client_id) {
      const { data: prev } = await db.from('analisis_ia').select('creado_en,tipo,contenido, ventas_cargas!inner(client_id,desde,hasta)')
        .eq('ventas_cargas.client_id', carga.client_id).eq('estado', 'listo').neq('id', id).order('creado_en', { ascending: false }).limit(3);
      extras.anteriores = (prev || []).map((p: any) => ({ fecha: p.creado_en, tipo: p.tipo, periodo: `${p.ventas_cargas.desde} al ${p.ventas_cargas.hasta}`, contenido: String(p.contenido || '').slice(0, 8000) }));
      fuentes.anteriores = extras.anteriores.map((p) => `${p.fecha.slice(0, 10)} · ${p.tipo}`);
    }
    const r = await generarAnalisis(a.tipo, a.entrada, null, extras);
    await db.from('analisis_ia').update({ estado: 'listo', contenido: r.texto, modelo: r.modelo, tokens_entrada: r.tokens_entrada, tokens_salida: r.tokens_salida, fuentes, terminado_en: new Date().toISOString() }).eq('id', id);
  } catch (e: any) {
    await db.from('analisis_ia').update({ estado: 'error', error: String(e?.message || e).slice(0, 1000), fuentes, terminado_en: new Date().toISOString() }).eq('id', id);
  }
  return new Response('ok');
};
