# AGENTS.md

Guía compacta para trabajar en este repo.

## Qué es esto

API REST en Node.js/Express para recibir y consultar datos GPS de la app GPSLogger. Los tracks se guardan en MySQL; el front de administración es HTML estático servido desde `public/`.

## Arranque rápido

1. Copiar `.env_template` a `.env` y rellenar credenciales.
2. Levantar MySQL.
3. Crear base de datos y tabla:
   ```bash
   npm run db:build
   ```
4. Iniciar servidor:
   ```bash
   npm start          # producción / prueba simple
   npm run dev        # desarrollo con nodemon
   ```

## Variables de entorno obligatorias

`server.js` hace `process.exit(1)` si faltan:

- `ADMIN_USER`
- `ADMIN_PASS`
- `JWT_SECRET` (mínimo recomendado 32 caracteres)

El resto tiene defaults:

- `PORT=3000`
- `DB_HOST=localhost`, `DB_USER=root`, `DB_PASS=''`, `DB_NAME=apiLogger`
- `CORS_ORIGIN` (vacío = CORS deshabilitado; `*` = todos; lista separada por comas = orígenes permitidos con credenciales)

## Base de datos

- El esquema SQL en `database.sql` es **solo referencia**; no hace falta ejecutarlo a mano.
- La fuente de verdad es `scripts/init-db.js` (invocado por `npm run db:build`).
- El script crea la base de datos y la tabla `tracks` solo si no existen (es incremental, no borra datos).
- `package.json` expone `db:reset`, pero el script no implementa el flag `--reset`: en la práctica funciona igual que `db:build`.

## Endpoints clave

- `POST /api/login` → admin obtiene sesión JWT (1h).
- `POST /api/generate-token` → con sesión admin genera token de ruta (30d).
- `POST /api/track` → recibe punto GPS, requiere `Authorization: Bearer <token_ruta>`.
- `GET /api/tracks/:route_name` y `/api/tracks/:route_name/latest` → **públicos**, añadir `?format=geojson` para Leaflet.
- `GET /api/routes/all` → lista de rutas con totales.
- `DELETE /api/routes/:route_name` → borra todos los puntos de una ruta (admin).
- `DELETE /api/tracks/:id` → borra un punto por ID (admin).
- `PUT /api/tracks/:id` → actualización parcial de un punto (admin): lat/lon/alt/speed/timestamp; si se envía una coordenada, deben ir ambas.
- `GET /api/health` → chequeo de salud incluyendo conexión a MySQL.

Las operaciones de admin requieren `Authorization: Bearer <session_token>`. `generate-token` sigue aceptando `sessionToken` en el body por compatibilidad, pero ahora pasa por el mismo middleware de sesión.

## Convenciones del código

- Nombres de ruta se sanitizan a minúsculas, máximo 100 caracteres, permitiendo solo `[a-z0-9-_]`; otros caracteres se reemplazan por `-`.
- Validación de tracks:
  - lat `-90..90`, lon `-180..180`
  - altitud opcional `-500..9000`
  - velocidad opcional `0..500`
- `timestamp_utc` acepta ISO 8601 o `YYYY-MM-DD HH:MM:SS`; si es inválido se usa la fecha actual.

## Rate limits

- `POST /api/track`: 1000 peticiones / 15 min.
- `POST /api/login`: 5 intentos / 15 min.
- Resto de `/api/`: 100 peticiones / 15 min.

## Producción

- Hay configuración de PM2 en `ecosystem.config.js`. Usa puerto `3005` por defecto (diferente del `3000` del `.env_template`).
- Logs de PM2 en `./logs/`.

## Notas para desarrollo

- No hay tests, linter, formateador ni typechecker en el repo.
- `node_modules`, `.env`, `package-lock.json` y `logs/` están en `.gitignore`.
- El servidor valida la conexión a MySQL antes de escuchar; si falla, imprime pistas y termina.
- El admin (`public/index.html`) muestra un marcador por cada punto de la ruta; su popup permite editar/borrar el punto, y el sidebar incluye un botón para borrar toda la ruta.
- Para la API completa ver `api.md`.
