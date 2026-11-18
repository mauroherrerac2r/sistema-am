import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Cliente, Perfil } from './datos';
import type { CfgCuenta, CuentaMeta } from './reglas';

export interface Ctx {
  sesion: Session;
  yo: Perfil;
  perfiles: Perfil[];
  clientes: Cliente[];            // todos
  visibles: Cliente[];            // según el filtro de AM
  cuentasCfg: CfgCuenta[];
  cuentasMeta: CuentaMeta[];
  metaPorId: Map<string, CuentaMeta>;
  recargar: () => Promise<void>;
}

export const Contexto = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error('Contexto no disponible');
  return c;
};

/** Nombre visible de una cuenta: sede si existe, si no el nombre de Meta. */
export const nombreCuenta = (cfg: CfgCuenta, meta?: CuentaMeta) => cfg.sede || meta?.nombre || cfg.ad_account_id;
