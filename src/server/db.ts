import { urlBase } from '../shared/url.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function dbServidor(): SupabaseClient {
  const url = urlBase(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** upsert por lotes para no pasar el límite de tamaño de una request. */
export async function upsertLotes(db: SupabaseClient, tabla: string, filas: any[], onConflict: string, lote = 500) {
  for (let i = 0; i < filas.length; i += lote) {
    const { error } = await db.from(tabla).upsert(filas.slice(i, i + lote), { onConflict });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}
