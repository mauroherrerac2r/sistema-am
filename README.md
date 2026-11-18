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
2. SQL Editor → pegar y correr `supabase/instalar.sql` (incluye las dos migraciones).
3. Authentication → Sign In / Providers → Email: **desactivar "Allow new users to sign up"**. Solo entra quien invitás.
4. Authentication → Users → **Add user → Create new user** para cada AM (email + contraseña, con **Auto Confirm User** marcado).
5. Hacer admin a quien administra el sistema (SQL Editor):
   ```sql
   update profiles set rol = 'admin', nombre = 'Mauro' where email = 'EMAIL_DE_MAURO';
   update profiles set nombre = 'Nico' where email = 'EMAIL_DE_NICO';
   ```
6. Project Settings → API: copiar `URL`, `anon key` y `service_role key`.

### 2. Variables
Copiar `.env.example` y completar los valores (se cargan en Netlify en el paso 3):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, y las mismas URL y anon key como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- `TOKEN_ENCRYPTION_KEY`: 32 bytes al azar en base64. Se genera en el SQL Editor de Supabase con
  `select encode(gen_random_bytes(32), 'base64');` (o con `npm run clave`). **Guardarla en un lugar seguro: si se pierde, hay que volver a cargar los tokens.**
- `SYNC_SECRET`: cualquier texto largo al azar.

**La `service_role key`, la `TOKEN_ENCRYPTION_KEY` y los tokens nunca van al repositorio.**

### 3. Netlify
1. Add new site → Import from GitHub → este repositorio. El build ya está configurado en `netlify.toml`.
2. Site configuration → Environment variables: cargar **todas** las de `.env`.
3. Deploy. Las tareas programadas solo corren en el deploy publicado (no en previews).

### 4. Usuarios de sistema de Meta (uno por BM)
En cada BM: Configuración del negocio → Usuarios del sistema → asignarle las cuentas publicitarias
(permiso de **ver rendimiento** alcanza) → Generar token con permisos `ads_read` y `business_management`,
vencimiento **nunca**.

En la app, pestaña **Sistema** → **Conectar BM**: pegar el token. Se verifica contra Meta, se guarda cifrado
y en un minuto aparecen las cuentas que ve.

### 5. Clientes
Pestaña **Clientes** → **Importar desde el Sheet**: subir el CSV del Sheet "Configuración de clientes"
(columna opcional **AM** con el email del Account Manager). Después se edita todo desde esa misma pestaña.

### 6. Primera sincronización
Pestaña **Sistema** → **Sincronizar histórico**. En 2–5 minutos la pestaña **Operación** muestra los datos.

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
