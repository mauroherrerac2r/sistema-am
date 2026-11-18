import type { TipoSync } from './jobs.js';

/** Llama a la función de fondo; responde enseguida (202) y la sync sigue sola. */
export async function dispararSync(tipo: TipoSync) {
  const base = process.env.URL;
  if (!base || !process.env.SYNC_SECRET) throw new Error('Faltan URL o SYNC_SECRET');
  const r = await fetch(`${base}/.netlify/functions/sync-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-secret': process.env.SYNC_SECRET },
    body: JSON.stringify({ tipo }),
  });
  if (r.status >= 400) throw new Error(`sync-background respondió ${r.status}`);
}
