# Sistema AM

App interna para Account Managers (y luego Paid Media): datos de Meta Ads propios, sincronizados con los
usuarios de sistema de cada Business Manager, sin depender de conectores de terceros.

- **Web:** React + Vite, alojada en Netlify.
- **Servidor:** Netlify Functions (sincronización programada).
- **Base, login y archivos:** Supabase.
- **Meta:** Graph API con tokens de usuario de sistema, guardados cifrados (AES-256-GCM).

Especificación completa y fases: [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md).

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crear un proyecto en supabase.com (región São Paulo).
2. SQL Editor → pegar y correr `supabase/migrations/0001_init.sql`.
3. Authentication → Sign In / Providers → Email: **desactivar "Allow new users to sign up"**. Solo entra quien invitás.
4. Authentication → Users → **Invite user** para cada AM (Mauro, Nico).
5. Hacer admin a quien administra el sistema (SQL Editor):
   ```sql
   update profiles set rol = 'admin', nombre = 'Mauro' where email = 'EMAIL_DE_MAURO';
   update profiles set nombre = 'Nico' where email = 'EMAIL_DE_NICO';
   ```
6. Project Settings → API: copiar `URL`, `anon key` y `service_role key`.

### 2. Variables
Copiar `.env.example` a `.env` y completar. La clave de cifrado se genera con:
```bash
npm install && npm run clave
```
`SYNC_SECRET`: cualquier texto largo al azar (se puede generar con el mismo comando).
**La `service_role key`, la `TOKEN_ENCRYPTION_KEY` y los tokens nunca van al repositorio.**

### 3. Usuarios de sistema de Meta (uno por BM)
En cada BM: Configuración del negocio → Usuarios del sistema → asignarle las cuentas publicitarias
(permiso de **ver rendimiento** alcanza) → Generar token con permisos `ads_read` y `business_management`,
vencimiento **nunca**. Después, por cada BM:
```bash
npm run bm:agregar -- "Nombre del BM" ID_DEL_BM
```
Pide el token por consola, lo verifica contra Meta, muestra cuántas cuentas ve y lo guarda cifrado.

### 4. Clientes (desde el Sheet actual)
Descargar el Sheet "Configuración de clientes" como CSV. Opcional: agregar una columna **AM** con el email
del Account Manager de cada cliente. Luego:
```bash
npm run config:importar -- ruta/al/archivo.csv
```
Se puede correr de nuevo cuando cambie el Sheet; actualiza sin duplicar.

### 5. Netlify
1. Add new site → Import from GitHub → este repositorio. El build ya está configurado en `netlify.toml`.
2. Site configuration → Environment variables: cargar **todas** las de `.env`.
3. Deploy. Las tareas programadas solo corren en el deploy publicado (no en previews).

### 6. Verificar
Entrar a la web con tu usuario → **Actualizar cuentas** → **Sincronizar histórico**. En 2–5 minutos
aparecen las cuentas con su estado y el registro de la sincronización.

## Sincronización automática
| Tarea | Cuándo | Qué trae |
|---|---|---|
| `cron-hoy` | cada 30 min | día en curso (zona de cada cuenta), nivel cuenta y anuncio |
| `cron-historico` | 05:10 ARG | cuentas y su estado, últimos 28 días cerrados, campañas/conjuntos/anuncios |

Solo se sincronizan en detalle las cuentas cargadas en algún cliente.

## Desarrollo
```bash
npm run dev     # web local
npm test        # pruebas
npm run build   # chequeo de tipos + build
```
