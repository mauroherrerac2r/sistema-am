// Trabajos de sincronización: leen BMs de la base, llaman a Meta y guardan.
import type { SupabaseClient } from '@supabase/supabase-js';
import { descifrar } from './crypto.js';
import { MetaClient, MetaError } from './meta/client.js';
import { cuentasDelToken, insightsCuenta, estructuraCuenta, fechaEnZona, enParalelo, identidad } from './meta/sync.js';
import { upsertLotes } from './db.js';

export type TipoSync = 'cuentas' | 'historico' | 'hoy';

interface Bm { id: string; nombre: string; token_cifrado: string }
interface Cuenta { id: string; bm_id: string; zona_horaria: string | null }

async function registrar(db: SupabaseClient, tipo: TipoSync) {
  const { data, error } = await db.from('sync_runs').insert({ tipo }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function cerrar(db: SupabaseClient, id: string, ok: number, errores: { item: any; error: string }[], extra: object = {}) {
  await db.from('sync_runs').update({
    terminado_en: new Date().toISOString(),
    estado: errores.length === 0 ? 'ok' : ok > 0 ? 'parcial' : 'error',
    cuentas_ok: ok,
    cuentas_error: errores.length,
    detalle: { errores: errores.map((e) => ({ objeto: e.item?.id ?? e.item, error: e.error })), ...extra },
  }).eq('id', id);
}

async function bms(db: SupabaseClient): Promise<Bm[]> {
  const { data, error } = await db.from('business_managers').select('id,nombre,token_cifrado').eq('activo', true);
  if (error) throw new Error(error.message);
  return data as Bm[];
}

function clientes(lista: Bm[]) {
  return new Map(lista.map((b) => [b.id, new MetaClient({ token: descifrar(b.token_cifrado) })]));
}

/** Descubre las cuentas que ve cada usuario de sistema y actualiza su estado. */
export async function syncCuentas(db: SupabaseClient) {
  const run = await registrar(db, 'cuentas');
  const lista = await bms(db);
  const metas = clientes(lista);
  const { ok, err } = await enParalelo(lista, 3, async (bm) => {
    const meta = metas.get(bm.id)!;
    try {
      const yo = await identidad(meta);
      const cuentas = await cuentasDelToken(meta);
      await upsertLotes(db, 'ad_accounts', cuentas.map((c) => ({ ...c, bm_id: bm.id, actualizado_en: new Date().toISOString() })), 'id');
      await db.from('business_managers').update({ system_user_id: yo.id, system_user_nombre: yo.name, ultimo_chequeo: new Date().toISOString(), ultimo_error: null }).eq('id', bm.id);
      return cuentas.length;
    } catch (e: any) {
      const msg = e instanceof MetaError && e.esToken ? 'Token inválido o vencido: generá uno nuevo para este usuario de sistema.' : e.message;
      await db.from('business_managers').update({ ultimo_chequeo: new Date().toISOString(), ultimo_error: msg }).eq('id', bm.id);
      throw new Error(msg);
    }
  });
  await cerrar(db, run, ok.length, err, { cuentas: ok.reduce((t, x) => t + x.res, 0) });
}

/** Cuentas configuradas en algún cliente (solo esas se sincronizan en detalle). */
async function cuentasConfiguradas(db: SupabaseClient): Promise<Cuenta[]> {
  const { data, error } = await db.from('client_accounts').select('ad_accounts!inner(id,bm_id,zona_horaria)');
  if (error) throw new Error(error.message);
  return (data as any[]).map((r) => r.ad_accounts).filter((c) => c.bm_id);
}

/**
 * historico: los últimos `dias` días completos + estructura de campañas (corre de noche).
 * hoy: solo el día en curso en la zona de cada cuenta (corre cada 30 min).
 */
export async function syncInsights(db: SupabaseClient, tipo: 'historico' | 'hoy', dias = 28) {
  const run = await registrar(db, tipo);
  const lista = await bms(db);
  const metas = clientes(lista);
  const cuentas = await cuentasConfiguradas(db);
  const { ok, err } = await enParalelo(cuentas, 4, async (c) => {
    const meta = metas.get(c.bm_id);
    if (!meta) throw new Error('El BM de esta cuenta está inactivo o fue borrado');
    const rango = tipo === 'hoy'
      ? { since: fechaEnZona(c.zona_horaria, 0), until: fechaEnZona(c.zona_horaria, 0) }
      : { since: fechaEnZona(c.zona_horaria, -dias), until: fechaEnZona(c.zona_horaria, -1) };
    const filas = await insightsCuenta(meta, c.id, rango);
    const ahora = new Date().toISOString();
    await upsertLotes(db, 'insights_daily', filas.map((f) => ({ ...f, actualizado_en: ahora })), 'nivel,objeto_id,fecha');
    if (tipo === 'historico') {
      const e = await estructuraCuenta(meta, c.id);
      await upsertLotes(db, 'campaigns', e.campaigns.map((x) => ({ ...x, actualizado_en: ahora })), 'id');
      await upsertLotes(db, 'adsets', e.adsets.map((x) => ({ ...x, actualizado_en: ahora })), 'id');
      await upsertLotes(db, 'ads', e.ads.map((x) => ({ ...x, actualizado_en: ahora })), 'id');
    }
    return filas.length;
  });
  await cerrar(db, run, ok.length, err, { filas: ok.reduce((t, x) => t + x.res, 0) });
}

export async function correr(db: SupabaseClient, tipo: TipoSync) {
  if (tipo === 'cuentas') return syncCuentas(db);
  if (tipo === 'historico') { await syncCuentas(db); return syncInsights(db, 'historico'); }
  return syncInsights(db, 'hoy');
}
