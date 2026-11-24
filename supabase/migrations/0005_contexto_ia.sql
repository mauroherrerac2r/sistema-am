-- Contexto para la IA, cargado ANTES del análisis.
-- Del negocio (estable, por cliente) y del período (por cada carga de ventas).

alter table clients add column if not exists contexto_ia text;     -- rubro, qué es una venta, ciclo de venta, particularidades
alter table clients add column if not exists roas_objetivo numeric; -- retorno esperado (monto vendido / inversión)
alter table ventas_cargas add column if not exists contexto text;   -- qué pasó en este período

drop policy if exists "edita contexto" on ventas_cargas;
create policy "edita contexto" on ventas_cargas for update using (public.es_usuario_interno()) with check (public.es_usuario_interno());
grant update (contexto, nombre) on ventas_cargas to authenticated;
