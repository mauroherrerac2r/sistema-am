import type { TipoSync } from './jobs.js';

/** Llama a una función de fondo de Netlify; responde enseguida (202) y el trabajo sigue solo. */
export async function dispararFondo(funcion: string, body: object) {
  const base = process.env.URL;
  if (!base || !process.env.SYNC_SECRET) throw new Error('Faltan URL o SYNC_SECRET');
  const r = await fetch(`${base}/.netlify/functions/${funcion}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-secret': process.env.SYNC_SECRET },
    body: JSON.stringify(body),
  });
  if (r.status >= 400) throw new Error(`${funcion} respondió ${r.status}`);
}

export const dispararSync = (tipo: TipoSync) => dispararFondo('sync-background', { tipo });
