// Uso: npm run config:importar -- ruta/al/sheet.csv
// Carga clientes y cuentas desde el CSV del Sheet actual. Se puede correr de nuevo: actualiza.
import { readFileSync } from 'node:fs';
import { leerConfig } from '../src/server/config-csv.js';
import { dbServidor } from '../src/server/db.js';

const ruta = process.argv[2];
if (!ruta) { console.error('Uso: npm run config:importar -- ruta/al/sheet.csv'); process.exit(1); }
const filas = leerConfig(readFileSync(ruta, 'utf8'));
const db = dbServidor();

const { data: perfiles } = await db.from('profiles').select('id,email');
const amPorEmail = new Map((perfiles || []).map((p) => [p.email.toLowerCase(), p.id]));

const porCliente = new Map<string, typeof filas>();
for (const f of filas) porCliente.set(f.slug, [...(porCliente.get(f.slug) || []), f]);

for (const [slug, cuentas] of porCliente) {
  const am = cuentas.find((c) => c.am_email)?.am_email;
  const fila: any = { slug, nombre: cuentas[0].cliente, activo: cuentas.some((c) => c.activa) };
  if (am) {
    if (amPorEmail.has(am)) fila.am_id = amPorEmail.get(am);
    else console.warn(`  ${cuentas[0].cliente}: el AM ${am} todavía no tiene usuario; queda sin asignar.`);
  }
  const { data: cli, error } = await db.from('clients').upsert(fila, { onConflict: 'slug' }).select('id').single();
  if (error) throw new Error(error.message);
  // La cuenta puede no estar sincronizada aún: se crea con lo mínimo y la sync completa el resto.
  await db.from('ad_accounts').upsert(cuentas.map((c) => ({ id: c.ad_account_id, nombre: c.cuenta || c.ad_account_id, moneda: c.moneda })), { onConflict: 'id', ignoreDuplicates: true });
  const { error: e2 } = await db.from('client_accounts').upsert(cuentas.map((c) => ({
    ad_account_id: c.ad_account_id, client_id: cli.id, sede: c.sede, canales: c.canales,
    presupuesto_mensual: c.presupuesto_mensual, presupuesto_semanal: c.presupuesto_semanal,
    cpl_objetivo: c.cpl_objetivo, cpl_maximo: c.cpl_maximo, activa: c.activa, nota: c.nota,
    actualizado_en: new Date().toISOString(),
  })), { onConflict: 'ad_account_id' });
  if (e2) throw new Error(e2.message);
  console.log(`${cuentas[0].cliente}: ${cuentas.length} cuenta(s)`);
}
console.log(`Listo: ${porCliente.size} clientes, ${filas.length} cuentas.`);
