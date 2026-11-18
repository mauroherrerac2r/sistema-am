-- Fase 1: datos extra para el panel táctico y lectura de perfiles entre usuarios internos.

alter table ad_accounts add column if not exists tiene_pago boolean;
alter table adsets add column if not exists destino text;        -- WHATSAPP, MESSENGER, ON_AD (formulario), WEBSITE...
alter table adsets add column if not exists optimizacion text;   -- optimization_goal

-- Los AM necesitan ver nombres de los demás usuarios internos (para asignar clientes).
drop policy if exists "perfil propio" on profiles;
drop policy if exists "perfiles internos" on profiles;
create policy "perfiles internos" on profiles for select using (public.es_usuario_interno());

-- Alcance y frecuencia reales de los últimos 7 días por anuncio (no se pueden sumar día por día).
create table if not exists frecuencia_7d (
  ad_id text primary key,
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  hasta date not null,
  alcance bigint,
  frecuencia numeric,
  actualizado_en timestamptz not null default now()
);
alter table frecuencia_7d enable row level security;
drop policy if exists "lectura interna" on frecuencia_7d;
create policy "lectura interna" on frecuencia_7d for select using (public.es_usuario_interno());
