import type { Config } from '@netlify/functions';
import { dispararSync } from '../../src/server/disparar.js';

export default async () => { await dispararSync('hoy'); };
// Cada 30 minutos: datos del día en curso.
export const config: Config = { schedule: '*/30 * * * *' };
