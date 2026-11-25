-- Google Drive como fuente de contexto (carpeta por cliente) y de ventas (Sheets), y PM por cliente.

-- Conexión con Google (una cuenta de la organización). El token se guarda cifrado; solo el servidor lo lee.
create table if not exists integraciones (
  id text primary key,                  -- 'google_drive'
  token_cifrado text not null,
  cuenta_email text,
  conectado_por uuid references profiles (id) on delete set null,
  conectado_en timestamptz not null default now(),
  ultimo_error text
);
alter table integraciones enable row level security;   -- sin políticas: nadie desde la app
revoke all on integraciones from anon, authenticated;
grant all on integraciones to service_role;

create or replace view integraciones_publico with (security_invoker = false) as
  select id, cuenta_email, conectado_en, ultimo_error from integraciones where public.es_usuario_interno();
grant select on integraciones_publico to authenticated;

alter table clients add column if not exists drive_carpeta_id text;
alter table clients add column if not exists pm_id uuid references profiles (id) on delete set null;

-- Qué documentos y análisis previos leyó la IA en cada análisis (transparencia).
alter table analisis_ia add column if not exists fuentes jsonb;
