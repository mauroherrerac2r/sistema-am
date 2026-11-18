-- Sistema AM · instalación completa. Pegar TODO este archivo en Supabase > SQL Editor y tocar Run.
-- Se puede correr más de una vez sin romper nada.

-- Sistema AM · Fase 0: conector Meta, configuración de clientes y datos diarios.
-- Correr en el SQL Editor de Supabase (o con `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- Usuarios del sistema ----------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null default 'am' check (rol in ('admin', 'am', 'pm')),
  creado_en timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.es_usuario_interno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol in ('admin', 'am', 'pm'));
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin');
$$;

-- ---------- Business Managers (usuarios de sistema) ----------
-- El token se guarda cifrado (AES-256-GCM) con una clave que vive solo en Netlify.
-- Ningún usuario de la app puede leer esta tabla: solo las funciones del servidor.
create table if not exists business_managers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  business_id text,
  token_cifrado text not null,
  token_ultimos4 text not null,
  system_user_id text,
  system_user_nombre text,
  activo boolean not null default true,
  ultimo_chequeo timestamptz,
  ultimo_error text,
  creado_en timestamptz not null default now()
);

-- Vista sin el token, para mostrar estado en la app.
create or replace view business_managers_publico with (security_invoker = false) as
  select id, nombre, business_id, token_ultimos4, system_user_nombre, activo, ultimo_chequeo, ultimo_error, creado_en
  from business_managers
  where public.es_usuario_interno();

-- ---------- Cuentas publicitarias ----------
create table if not exists ad_accounts (
  id text primary key,                      -- ID sin el prefijo act_
  bm_id uuid references business_managers (id) on delete set null,
  nombre text not null,
  moneda text,
  zona_horaria text,
  estado_cuenta int,                        -- 1 activa, 2 deshabilitada, 3 sin pago, 7/8/9 revisión/cierre...
  motivo_deshabilitada int,
  gasto_historico numeric,
  actualizado_en timestamptz not null default now()
);

-- ---------- Clientes y configuración (reemplaza el Google Sheet) ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  am_id uuid references profiles (id) on delete set null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists client_accounts (
  ad_account_id text primary key references ad_accounts (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  sede text,
  canales text[] not null default '{}',     -- Formulario, WhatsApp, Messenger
  presupuesto_mensual numeric,
  presupuesto_semanal numeric,
  cpl_objetivo numeric,
  cpl_maximo numeric,
  activa boolean not null default true,
  nota text,
  actualizado_en timestamptz not null default now()
);

-- ---------- Estructura de campañas ----------
create table if not exists campaigns (
  id text primary key,
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  nombre text not null,
  objetivo text,
  estado text,
  estado_efectivo text,
  presupuesto_diario numeric,
  actualizado_en timestamptz not null default now()
);

create table if not exists adsets (
  id text primary key,
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  campaign_id text,
  nombre text not null,
  estado text,
  estado_efectivo text,
  presupuesto_diario numeric,
  aprendizaje text,                         -- LEARNING, SUCCESS, FAIL (aprendizaje limitado)
  actualizado_en timestamptz not null default now()
);

create table if not exists ads (
  id text primary key,
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  campaign_id text,
  adset_id text,
  nombre text not null,
  estado text,
  estado_efectivo text,
  creado_meta timestamptz,
  actualizado_en timestamptz not null default now()
);

-- ---------- Métricas diarias ----------
-- Una fila por objeto (cuenta o anuncio) y día, en la zona horaria de la cuenta.
create table if not exists insights_daily (
  nivel text not null check (nivel in ('account', 'ad')),
  objeto_id text not null,
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  campaign_id text,
  adset_id text,
  fecha date not null,
  inversion numeric not null default 0,
  impresiones bigint not null default 0,
  alcance bigint,
  frecuencia numeric,
  clics_enlace bigint not null default 0,
  leads int not null default 0,
  conversaciones int not null default 0,
  pedidos int not null default 0,
  acciones jsonb,                           -- respuesta cruda de Meta, para métricas futuras
  actualizado_en timestamptz not null default now(),
  primary key (nivel, objeto_id, fecha)
);
create index if not exists insights_daily_cuenta_fecha on insights_daily (ad_account_id, fecha);

-- ---------- Registro de sincronizaciones ----------
create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                       -- cuentas | historico | hoy
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'parcial', 'error')),
  cuentas_ok int not null default 0,
  cuentas_error int not null default 0,
  detalle jsonb
);
create index if not exists sync_runs_reciente on sync_runs (iniciado_en desc);

-- ---------- Seguridad (RLS) ----------
alter table profiles enable row level security;
alter table business_managers enable row level security;
alter table ad_accounts enable row level security;
alter table clients enable row level security;
alter table client_accounts enable row level security;
alter table campaigns enable row level security;
alter table adsets enable row level security;
alter table ads enable row level security;
alter table insights_daily enable row level security;
alter table sync_runs enable row level security;

-- business_managers: sin políticas => nadie de la app la lee. Solo el service role (servidor).

drop policy if exists "perfil propio" on profiles;
create policy "perfil propio" on profiles for select using (id = auth.uid() or public.es_admin());

do $$
declare t text;
begin
  foreach t in array array['ad_accounts','clients','client_accounts','campaigns','adsets','ads','insights_daily','sync_runs'] loop
    execute format('drop policy if exists "lectura interna" on %I', t);
    execute format('create policy "lectura interna" on %I for select using (public.es_usuario_interno())', t);
  end loop;
end $$;

-- La configuración de clientes la editan admin y AM.
drop policy if exists "edita config" on clients;
create policy "edita config" on clients for all using (public.es_usuario_interno()) with check (public.es_usuario_interno());
drop policy if exists "edita config" on client_accounts;
create policy "edita config" on client_accounts for all using (public.es_usuario_interno()) with check (public.es_usuario_interno());

grant select on business_managers_publico to authenticated;

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
