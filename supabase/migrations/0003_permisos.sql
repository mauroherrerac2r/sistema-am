-- Permisos explícitos sobre las tablas. Los proyectos nuevos de Supabase no los otorgan solos.
-- Las reglas de fila (RLS) siguen decidiendo QUÉ filas ve cada usuario; esto habilita el acceso a la tabla.

grant usage on schema public to authenticated, service_role;

-- Servidor (funciones de Netlify con la Secret key): acceso completo.
grant all on all tables in schema public to service_role;

-- Usuarios de la app: lectura de los datos del panel.
grant select on profiles, ad_accounts, clients, client_accounts, campaigns, adsets, ads,
  insights_daily, sync_runs, frecuencia_7d to authenticated;
grant select on business_managers_publico to authenticated;

-- Usuarios de la app: editan la configuración de clientes.
grant insert, update, delete on clients, client_accounts to authenticated;

-- Los tokens de Meta: nadie desde la app, nunca.
revoke all on business_managers from anon, authenticated;

-- Funciones que usan las reglas de acceso.
grant execute on function public.es_usuario_interno() to authenticated;
grant execute on function public.es_admin() to authenticated;
