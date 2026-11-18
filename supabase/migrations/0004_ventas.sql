-- Fase 2: ventas del CRM y análisis con IA.

-- Cada carga es un export del CRM para un cliente y un período.
create table if not exists ventas_cargas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  desde date not null,
  hasta date not null,
  fuente text not null default 'picallex',
  nombre text,
  filas int,
  creado_por uuid default auth.uid() references profiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  check (desde <= hasta)
);
create index if not exists ventas_cargas_cliente on ventas_cargas (client_id, creado_en desc);

-- Resultados del CRM sumados por anuncio de Meta (source_ad_id).
create table if not exists ventas_anuncio (
  carga_id uuid not null references ventas_cargas (id) on delete cascade,
  ad_id text not null,
  sede_crm text,
  pre_leads int not null default 0,
  leads int not null default 0,
  ordenes int not null default 0,
  monto numeric not null default 0,
  por_cobrar numeric not null default 0,
  cobrado numeric not null default 0,
  enlaces int not null default 1,
  primary key (carga_id, ad_id)
);

-- Análisis generados por IA sobre una carga.
create table if not exists analisis_ia (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references ventas_cargas (id) on delete cascade,
  tipo text not null check (tipo in ('cliente', 'paid')),
  estado text not null default 'generando' check (estado in ('generando', 'listo', 'error')),
  contexto text,
  entrada jsonb,
  contenido text,
  modelo text,
  error text,
  tokens_entrada int,
  tokens_salida int,
  creado_por uuid references profiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);
create index if not exists analisis_ia_carga on analisis_ia (carga_id, creado_en desc);

alter table ventas_cargas enable row level security;
alter table ventas_anuncio enable row level security;
alter table analisis_ia enable row level security;

drop policy if exists "lectura interna" on ventas_cargas;
create policy "lectura interna" on ventas_cargas for select using (public.es_usuario_interno());
drop policy if exists "carga interna" on ventas_cargas;
create policy "carga interna" on ventas_cargas for insert with check (public.es_usuario_interno());
drop policy if exists "borra interna" on ventas_cargas;
create policy "borra interna" on ventas_cargas for delete using (public.es_usuario_interno());

drop policy if exists "lectura interna" on ventas_anuncio;
create policy "lectura interna" on ventas_anuncio for select using (public.es_usuario_interno());
drop policy if exists "carga interna" on ventas_anuncio;
create policy "carga interna" on ventas_anuncio for insert with check (public.es_usuario_interno());

-- Los análisis los escribe solo el servidor; los usuarios los leen.
drop policy if exists "lectura interna" on analisis_ia;
create policy "lectura interna" on analisis_ia for select using (public.es_usuario_interno());

grant select, insert, delete on ventas_cargas to authenticated;
grant select, insert on ventas_anuncio to authenticated;
grant select on analisis_ia to authenticated;
grant all on ventas_cargas, ventas_anuncio, analisis_ia to service_role;
