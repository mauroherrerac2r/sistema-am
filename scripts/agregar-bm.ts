// Uso: npm run bm:agregar -- "Nombre del BM" [business_id]
// Pide el token del usuario de sistema por consola (no queda en el historial de la terminal).
import { createInterface } from 'node:readline/promises';
import { cifrar } from '../src/server/crypto.js';
import { MetaClient } from '../src/server/meta/client.js';
import { identidad, cuentasDelToken } from '../src/server/meta/sync.js';
import { dbServidor } from '../src/server/db.js';

const [nombre, businessId] = process.argv.slice(2);
if (!nombre) { console.error('Uso: npm run bm:agregar -- "Nombre del BM" [business_id]'); process.exit(1); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
const token = (await rl.question('Token del usuario de sistema: ')).trim();
rl.close();
if (token.length < 50) { console.error('Eso no parece un token de Meta.'); process.exit(1); }

const meta = new MetaClient({ token });
const yo = await identidad(meta);
const cuentas = await cuentasDelToken(meta);
console.log(`Usuario de sistema: ${yo.name} (${yo.id}). Ve ${cuentas.length} cuentas publicitarias.`);

const { error } = await dbServidor().from('business_managers').insert({
  nombre, business_id: businessId ?? null, token_cifrado: cifrar(token), token_ultimos4: token.slice(-4),
  system_user_id: yo.id, system_user_nombre: yo.name, ultimo_chequeo: new Date().toISOString(),
});
if (error) { console.error(error.message); process.exit(1); }
console.log('BM guardado. La próxima sincronización de cuentas va a traer sus cuentas.');
