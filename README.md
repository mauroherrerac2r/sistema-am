# Centro de Control · Clic2Ring

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
6. Project Settings → API Keys: copiar la **Publishable key** (`sb_publishable_…`) y la **Secret key** (`sb_secret_…`). No usar las legacy (se retiran en 2027). La URL está en Project Settings → Data API.

### 2. Variables
Copiar `.env.example` y completar los valores (se cargan en Netlify en el paso 3):
- `SUPABASE_URL` y `VITE_SUPABASE_URL`: la Project URL.
- `SUPABASE_ANON_KEY` y `VITE_SUPABASE_ANON_KEY`: la Publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: la Secret key.
- `TOKEN_ENCRYPTION_KEY`: 32 bytes al azar en base64. Se genera en el SQL Editor de Supabase con
  `select encode(gen_random_bytes(32), 'base64');` (o con `npm run clave`). **Guardarla en un lugar seguro: si se pierde, hay que volver a cargar los tokens.**
- `SYNC_SECRET`: cualquier texto largo al azar.
- `ANTHROPIC_API_KEY`: clave de console.anthropic.com para el análisis con IA (Fase 2). Marcarla como secreta.
- `ANTHROPIC_MODEL` (opcional): modelo del análisis. Por defecto `claude-opus-5-5`.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: el mismo cliente OAuth del login con Google. Habilitan la lectura de Drive (carpeta de contexto por cliente) y de Google Sheets. Marcar el secreto como secreta.

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

## Google Drive (contexto por cliente y Sheets)
1. Google Cloud → proyecto Sistema AM → **APIs y servicios → Biblioteca**: habilitar **Google Drive API** y **Google Sheets API**.
2. **Google Auth Platform → Acceso a los datos → Agregar o quitar permisos**: sumar `.../auth/drive.readonly`.
3. **Clientes → tu cliente web → URIs de redireccionamiento**: agregar `https://TU-SITIO.netlify.app/api/google/callback`.
4. Netlify: cargar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` y volver a publicar.
5. En la app: **Sistema → Integraciones → Conectar Google Drive** con una cuenta que vea todas las carpetas de clientes.
6. **Clientes → Carpeta de Google Drive**: pegar el link de la carpeta de cada cliente. Un documento con "contexto", "ficha" o "brief" en el nombre se lee primero.
