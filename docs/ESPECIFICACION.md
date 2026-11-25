# Sistema AM · Especificación

## Objetivo
Darle a cada Account Manager una herramienta propia para (1) controlar la operación diaria de sus cuentas
de Meta Ads y (2) analizar resultados de negocio cruzando la inversión con las ventas que exporta el CRM del
cliente, con conclusiones listas para el cliente y para el equipo de Paid Media.

## Usuarios
| Rol | Quién | Ve |
|---|---|---|
| admin | Mauro | todo + BMs, sincronización, configuración |
| am | Mauro, Nicolás | sus clientes por defecto (el AM va por cliente), con opción de ver todos |
| pm | Agustina, Victoria, Lucía | panel de Paid Media; el PM se asigna por cuenta publicitaria |

Clientes con una o varias cuentas publicitarias; la **sede es opcional**.

## Arquitectura
```
Usuarios de sistema (1 por BM) → Netlify Functions (cron) → Supabase (Postgres)
                                                             ↓
                                           App web (React, Netlify) con login
                                                             ↓
                                    API de Claude (lectura de imágenes y análisis)
```
- Los tokens de Meta se guardan cifrados; la clave vive solo en Netlify. Ningún usuario los puede leer.
- La app lee de la base: carga instantánea, historial propio, no depende del acceso de cada persona a Meta.
- La IA se usa vía API desde el servidor (Fase 2), no desde conectores.

## Datos
| Tabla | Contenido |
|---|---|
| business_managers | BM, usuario de sistema, token cifrado, estado del token |
| ad_accounts | cuentas visibles, moneda, zona horaria, estado (activa, sin pago, deshabilitada) |
| clients / client_accounts | cliente, AM, sede, canales, presupuesto, CPL objetivo y máximo (reemplaza el Sheet) |
| campaigns / adsets / ads | estructura y estado, aprendizaje del conjunto |
| insights_daily | por día y por cuenta y anuncio: inversión, impresiones, alcance, clics, leads, conversaciones, pedidos |
| sync_runs | registro de cada sincronización y sus errores |

**Resultado según canal:** Formulario = leads; WhatsApp/Messenger/Instagram = conversaciones iniciadas;
pedidos = evento de mensajería "pedido creado".

## Fases

### Fase 0 · Conector propio ✅ (este entregable)
Base de datos, carga de BMs, importación del Sheet, sincronización programada, pantalla de estado.

### Fase 1 · Táctico AM ✅
Réplica mejorada del panel actual, leyendo de la base.
- Inicio: KPIs de cartera (inversión y leads hoy vs ayer, clientes en crítico/atención, cuentas sin entrega).
- Operación del día: ritmo vs presupuesto proporcional a la hora, CPL vs objetivo/máximo, estado y motivo.
- Clientes 7 días: semáforo ordenado por gravedad, pacing semanal, CPL vs semana previa.
- Detalle por cliente (desplegable): cuentas, anuncios con veredicto (Ganador/Atención/Pausar/Fatiga),
  evolución 14 días, conjuntos con observaciones de entrega.
- Análisis puntual por rango de fechas y canal.
- Configuración de clientes editable en la app (fin del Sheet).
- Filtro "Mis clientes" por AM.

Reglas de estado (mismas del panel actual):
- **Crítico:** CPL > máximo, pacing fuera de 80–120 %, cuenta bloqueada o sin pago, sin entrega con 25 % del día transcurrido.
- **Atención:** CPL entre objetivo y máximo, pacing fuera de 90–110 %, 2+ días sin entrega.
- El CPL del día solo alerta desde 3 resultados.

### Fase 2 · Estratégico AM ✅ (carga PicallEx por anuncio + análisis IA)
1. **Carga** de exportaciones del CRM: CSV/Excel (PicallEx u otro) o captura/PDF.
2. **Mapeo de columnas** por cliente, que se recuerda: fecha, sede, producto, origen/campaña, estado, monto.
   Plantilla predefinida para PicallEx; otros CRM se mapean una vez.
3. Imágenes/PDF → la IA extrae una tabla → **el AM valida antes de usarla**.
4. **Cruce con Meta** por fecha (siempre), y por sede, producto o campaña cuando el dato existe.
5. **Métricas:** ventas, monto, ROAS real, costo por venta, tasa lead → venta, ticket promedio, vs período anterior.
6. **Análisis con IA** sobre los números calculados (la IA interpreta; no calcula).
7. **Dos salidas:** informe para el cliente (negocio) y brief para Paid Media (qué escalar, pausar, testear).
   Exportables a PDF y compartibles.

Columnas mínimas pedidas al cliente: fecha, monto, estado (vendido/no), y si existe: sede, producto, origen.

### Fase 3 · Paid Media ✅ (BETA: Operación, Análisis de cuenta, Creativos, Recomendaciones)
Sobre la misma base: creativos y fatiga, tests, presupuesto por campaña, recomendaciones accionables,
recepción de los briefs del AM. Solo lectura sobre Meta al inicio.

## Riesgos y decisiones
| Tema | Decisión |
|---|---|
| Seguridad de tokens | Cifrados, solo lectura, nunca en navegador ni repositorio |
| Límites de la API de Meta | Concurrencia limitada, reintentos con espera, datos cerrados de noche |
| Formatos de ventas distintos | Mapeo por cliente guardado; validación humana antes de analizar |
| Cruce ventas ↔ campañas | Por fecha siempre; más fino si el CRM trae origen/UTM |
