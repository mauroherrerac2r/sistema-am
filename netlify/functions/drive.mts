// Lecturas de Drive para la app: lista de documentos de la carpeta de un cliente y lectura de un Sheet.
import { usuarioConRol } from '../../src/server/auth.js';
import { dbServidor } from '../../src/server/db.js';
import { driveCliente, listarCarpeta, priorizar, esLegible, leerSheet } from '../../src/server/google.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  if (!(await usuarioConRol(req, ['admin', 'am', 'pm']))) return new Response('No autorizado', { status: 403 });
  const b = (await req.json().catch(() => ({}))) as any;
  const db = dbServidor();
  try {
    const drive = await driveCliente(db);
    if (b.accion === 'carpeta') {
      const { data: c } = await db.from('clients').select('drive_carpeta_id').eq('id', String(b.cliente_id || '')).single();
      if (!c?.drive_carpeta_id) return Response.json({ archivos: [], sinCarpeta: true });
      const todos = await listarCarpeta(drive, c.drive_carpeta_id);
      const orden = priorizar(todos);
      return Response.json({ archivos: orden.map((a) => ({ nombre: a.nombre, tipo: a.tipo, modificado: a.modificado, link: a.link })), noLegibles: todos.filter((a) => !esLegible(a)).map((a) => a.nombre) });
    }
    if (b.accion === 'sheet') return Response.json(await leerSheet(drive, String(b.url || '')));
    return new Response('Acción desconocida', { status: 400 });
  } catch (e: any) { return new Response(e.message, { status: 400 }); }
};

export const config = { path: '/api/drive' };
