-- Panel de Paid Media: PM por cuenta publicitaria, creativos, ubicaciones y estado de recomendaciones.

-- El PM se asigna por cuenta (dos PM pueden compartir un cliente, nunca una cuenta).
alter table client_accounts add column if not exists pm_id uuid references profiles (id) on delete set null;
-- Si se había cargado PM a nivel cliente (script 0006), se copia a sus cuentas. Sin 0006 no hace nada.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'pm_id') then
    execute 'update client_accounts ca set pm_id = c.pm_id from clients c where ca.client_id = c.id and ca.pm_id is null and c.pm_id is not null';
  end if;
end $$;

-- Creativo de cada anuncio.
alter table ads add column if not exists miniatura text;   -- URL de Meta (vence; se renueva cada noche)
alter table ads add column if not exists formato text;     -- VIDEO, PHOTO, SHARE (carrusel/link), etc.

-- Inversión y resultados por ubicación (Reels, Feed, Stories…), por cuenta y día.
create table if not exists insights_ubicacion (
  ad_account_id text not null references ad_accounts (id) on delete cascade,
  fecha date not null,
  plataforma text not null,
  posicion text not null,
  inversion numeric not null default 0,
  impresiones bigint not null default 0,
  clics_enlace bigint not null default 0,
  leads int not null default 0,
  conversaciones int not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (ad_account_id, fecha, plataforma, posicion)
);

-- Qué hizo el PM con cada recomendación (Hecho / Pospuesta / Descartada) y hasta cuándo no vuelve a aparecer.
create table if not exists recomendaciones_estado (
  clave text primary key,            -- tipo:objeto (ej. pausar:120250…)
  ad_account_id text not null,
  estado text not null check (estado in ('hecho', 'pospuesta', 'descartada')),
  hasta date not null,
  usuario uuid default auth.uid() references profiles (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

alter table insights_ubicacion enable row level security;
alter table recomendaciones_estado enable row level security;
drop policy if exists "lectura interna" on insights_ubicacion;
create policy "lectura interna" on insights_ubicacion for select using (public.es_usuario_interno());
drop policy if exists "lectura interna" on recomendaciones_estado;
create policy "lectura interna" on recomendaciones_estado for select using (public.es_usuario_interno());
drop policy if exists "escritura interna" on recomendaciones_estado;
create policy "escritura interna" on recomendaciones_estado for all using (public.es_usuario_interno()) with check (public.es_usuario_interno());

grant select on insights_ubicacion to authenticated;
grant select, insert, update, delete on recomendaciones_estado to authenticated;
grant all on insights_ubicacion, recomendaciones_estado to service_role;
