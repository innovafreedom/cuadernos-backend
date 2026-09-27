# Cuadernos — despliegue en Northflank

Blog multi-usuario: cualquiera con el enlace crea su blog (con contraseña propia)
y publica entradas con texto y video. Tú y tu equipo monitorean y moderan todo
desde `/admin.html` con una contraseña de equipo.

## Qué incluye este proyecto

- `server.js` — la API (Express)
- `public/index.html` — sitio público (crear blog, publicar entradas)
- `public/admin.html` — panel del equipo (ver y borrar cualquier cosa)
- `Dockerfile` — para que Northflank construya el contenedor
- `data/` — donde se guarda `data.json` (blogs y entradas)
- `uploads/` — donde se guardan los videos subidos

## Paso 1 — Sube el código a GitHub

1. Crea un repositorio nuevo y vacío en https://github.com/new (sin README, sin .gitignore).
2. Desde la carpeta de este proyecto:

```bash
git init
git add .
git commit -m "Cuadernos - primer despliegue"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

## Paso 2 — Crea la cuenta en Northflank

1. Ve a https://northflank.com y crea una cuenta gratuita.
2. Es posible que te pida una tarjeta al registrarte — no te cobra nada
   mientras te quedes en el plan gratuito; solo se usa si decides subir de plan.

## Paso 3 — Crea el proyecto y el servicio

1. Dentro de Northflank, crea un **Project** nuevo (el nombre no importa, p. ej. "cuadernos").
2. Dentro del proyecto, click en **Create new → Service** → elige **Combined service**
   (construye y despliega desde tu repo en un solo paso).
3. Conecta tu cuenta de GitHub y selecciona el repositorio que acabas de subir, rama `main`.
4. En **Build type**, elige **Dockerfile** (Northflank lo detecta solo si ve el archivo `Dockerfile`).
5. En **Networking / Ports**, confirma que el puerto **3000** quede marcado como puerto
   público HTTP (Northflank suele detectarlo automáticamente desde el `EXPOSE 3000`
   del Dockerfile).
6. Elige el plan de recursos gratuito (free / nf-compute-mini, según lo que te muestre tu cuenta).

## Paso 4 — Variables de entorno

En la sección **Environment variables** del servicio, agrega:

| Nombre | Valor |
|---|---|
| `ADMIN_PASSWORD` | la contraseña que usarán tú y tu equipo para entrar a `/admin.html` |
| `PORT` | `3000` |

Guarda los cambios — esto suele disparar un redeploy automático.

## Paso 5 — Volumen persistente (¡importante, no te lo saltes!)

Sin esto, los blogs y videos se perderían cada vez que el contenedor se reinicie.

1. En el servicio, ve a la pestaña **Volumes**.
2. Crea un volumen nuevo, por ejemplo de **1–2 GB** (suficiente para empezar).
3. Móntalo en la ruta `/app/data` (ahí vive `data.json`, blogs y contraseñas).
4. Crea un segundo volumen (o uno más grande) montado en `/app/uploads` (ahí van los videos).
5. Guarda — el servicio se reiniciará para aplicar el volumen.

Si tu plan gratuito solo te deja un volumen, monta uno solo en `/app` completo
en vez de separarlo en `/app/data` y `/app/uploads`; con eso alcanza igual.

## Paso 6 — Verifica que quedó público

1. Cuando el build termine y el servicio pase a estado "Running", Northflank
   te da una URL tipo `https://tu-servicio--tu-proyecto.code.run`.
2. Abre esa URL — deberías ver el sitio de Cuadernos.
3. Entra a `/admin.html` con la contraseña que pusiste en `ADMIN_PASSWORD` y confirma
   que puedes ver el panel del equipo.
4. Comparte esa URL — cualquiera con el enlace puede crear su blog y publicar,
   con su propia contraseña.

## Después del primer despliegue

Cada vez que hagas `git push` a `main`, Northflank puede reconstruir y
redesplegar automáticamente (revisa que la opción de auto-deploy esté
activada en la configuración del servicio). Los datos en los volúmenes
no se pierden entre despliegues.

## Límites a tener en cuenta

- El plan gratuito de Northflank tiene límites de cómputo y almacenamiento —
  si el proyecto crece mucho (muchos videos, mucho tráfico), en algún
  momento vas a necesitar subir de plan o mover los videos a un
  almacenamiento externo (Cloudflare R2, S3, etc.). Puedo ayudarte a
  adaptar el código si llegas a ese punto.
- La contraseña de administrador es una sola, compartida por todo el
  equipo. Si más adelante quieres cuentas individuales con roles
  distintos, también se puede agregar.
