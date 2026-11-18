import type { Config } from '@netlify/functions';
import { dispararSync } from '../../src/server/disparar.js';

export default async () => { await dispararSync('historico'); };
// Todos los días 08:10 UTC (05:10 Argentina): cuentas, últimos 28 días cerrados y estructura.
export const config: Config = { schedule: '10 8 * * *' };
