# GPS Logger API - Documentación

API REST para recibir y consultar datos GPS de dispositivos GPSLogger.

## Configuración Rápida

```bash
# 1. Configurar variables de entorno en .env
# 2. Crear base de datos
npm run db:build

# 3. Iniciar servidor
npm start
```

## Autenticación

La API usa JWT (JSON Web Tokens) para autenticación.

### Para enviar datos GPS (POST /api/track)

Incluir el token en el header:

```
Authorization: Bearer <token_jwt>
```

El token contiene el nombre de la ruta y es válido por 30 días.

### Para consultar datos (GET /api/tracks/*, GET /api/routes/all)

**No requiere autenticación** - Los endpoints de consulta son públicos.

### Para operaciones de administración (DELETE /api/routes/*, DELETE /api/tracks/:id, PUT /api/tracks/:id)

Usar el **session token** obtenido en `/api/login`:

```
Authorization: Bearer <session_token>
```

---

## Endpoints

### POST /api/login

Autentica al administrador para acceder al generador de tokens.

**Body:**
```json
{
  "username": "admin",
  "password": "tu_password"
}
```

**Respuesta:**
```json
{
  "success": true,
  "token": "<session_token>"
}
```

---

### POST /api/generate-token

Genera un token JWT para una ruta GPS (requiere sesión de admin).

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "sessionToken": "<token_de_sesion>",
  "routeName": "ruta-madrid",
  "expiresIn": "30d"
}
```

**Parámetros:**
- `routeName` (requerido): nombre de la ruta.
- `expiresIn` (opcional): duración del token. Valores válidos: `1d`, `7d`, `30d`, `90d`, `1y`, `never`. Si no se envía, se usa el valor por defecto configurado en `ROUTE_TOKEN_EXPIRY` (default: `30d`).

**Respuesta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "route_name": "ruta-madrid",
  "expires_in": "30d"
}
```

**Notas:**
- El nombre de ruta se sanitiza automáticamente (solo letras, números, guiones)
- Se convierte a minúsculas
- Máximo 100 caracteres
- `expiresIn: "never"` genera un token JWT sin fecha de expiración

---

### POST /api/track

Recibe un punto GPS. Requiere JWT con nombre de ruta.

**Headers:**
```
Authorization: Bearer <token_jwt>
Content-Type: application/json
```

**Body:**
```json
{
  "latitude": 40.4168,
  "longitude": -3.7038,
  "altitude": 667.5,
  "timestamp_utc": "2024-01-15T14:30:00Z",
  "speed": 15.3
}
```

**Campos:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| latitude | number | Sí | -90 a 90 |
| longitude | number | Sí | -180 a 180 |
| altitude | number | No | -500 a 9000 metros |
| timestamp_utc | string | No | Formato ISO 8601 |
| speed | number | No | 0 a 500 km/h |

**Respuesta (201):**
```json
{
  "success": true,
  "message": "Track guardado",
  "route": "ruta-madrid"
}
```

---

### GET /api/tracks/:route_name

Obtiene **todos** los puntos de una ruta ordenados por fecha (ascendente).

**Parámetros de URL:**
- `:route_name` - Nombre de la ruta (ej: "ruta-madrid")

**Parámetros de query:**
- `format=geojson` (opcional) - Devuelve en formato GeoJSON

**Ejemplos:**

```bash
# Formato normal (JSON)
curl http://localhost:3000/api/tracks/ruta-madrid

# Formato GeoJSON (para Leaflet)
curl http://localhost:3000/api/tracks/ruta-madrid?format=geojson
```

**Respuesta (JSON):**
```json
{
  "success": true,
  "route": "ruta-madrid",
  "total": 1250,
  "points": [
    {
      "id": 1,
      "route_name": "ruta-madrid",
      "latitude": 40.4168,
      "longitude": -3.7038,
      "altitude": 667.50,
      "timestamp_utc": "2024-01-15T14:30:00Z",
      "speed": 15.30,
      "created_at": "2024-01-15T14:30:05Z"
    }
  ]
}
```

**Respuesta (GeoJSON):**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-3.7038, 40.4168]
      },
      "properties": {
        "id": 1,
        "route_name": "ruta-madrid",
        "altitude": 667.50,
        "speed": 15.30,
        "timestamp": "2024-01-15T14:30:00Z",
        "created_at": "2024-01-15T14:30:05Z"
      }
    }
  ],
  "properties": {
    "route_name": "ruta-madrid",
    "total": 1250
  }
}
```

---

### GET /api/tracks/:route_name/latest

Obtiene el **último punto** de una ruta (posición actual).

**Parámetros de URL:**
- `:route_name` - Nombre de la ruta

**Parámetros de query:**
- `format=geojson` (opcional) - Devuelve en formato GeoJSON

**Ejemplos:**

```bash
# Formato normal
curl http://localhost:3000/api/tracks/ruta-madrid/latest

# Formato GeoJSON
curl http://localhost:3000/api/tracks/ruta-madrid/latest?format=geojson
```

**Respuesta (JSON):**
```json
{
  "success": true,
  "route": "ruta-madrid",
  "point": {
    "id": 1250,
    "route_name": "ruta-madrid",
    "latitude": 40.4180,
    "longitude": -3.7050,
    "altitude": 670.00,
    "timestamp_utc": "2024-01-15T16:45:00Z",
    "speed": 12.50,
    "created_at": "2024-01-15T16:45:02Z"
  }
}
```

**Respuesta (GeoJSON):**
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-3.7050, 40.4180]
  },
  "properties": {
    "id": 1250,
    "route_name": "ruta-madrid",
    "altitude": 670.00,
    "speed": 12.50,
    "timestamp": "2024-01-15T16:45:00Z",
    "created_at": "2024-01-15T16:45:02Z"
  }
}
```

---

### DELETE /api/routes/:route_name

Borra **todos** los puntos de una ruta. Requiere sesión de administrador.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Respuesta:**
```json
{
  "success": true,
  "deleted": 1250,
  "route": "ruta-madrid"
}
```

---

### DELETE /api/tracks/:id

Borra un punto GPS por su `id`. Requiere sesión de administrador.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Respuesta:**
```json
{
  "success": true,
  "id": 42
}
```

---

### PUT /api/tracks/:id

Actualiza un punto GPS de forma **parcial**. Requiere sesión de administrador.

**Headers:**
```
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Body (todos los campos son opcionales):**
```json
{
  "latitude": 40.4168,
  "longitude": -3.7038,
  "altitude": 670.0,
  "speed": 12.5,
  "timestamp_utc": "2024-01-15T16:45:00Z"
}
```

**Notas:**
- Si se envía `latitude` o `longitude`, deben enviarse **ambas**.
- Los campos omitidos no se modifican.
- No se puede cambiar la ruta (`route_name`).

**Respuesta:**
```json
{
  "success": true,
  "point": {
    "id": 42,
    "route_name": "ruta-madrid",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "altitude": 670.00,
    "timestamp_utc": "2024-01-15T16:45:00Z",
    "speed": 12.50,
    "created_at": "2024-01-15T16:45:02Z"
  }
}
```

---

## Ejemplos de Uso

### Con cURL

```bash
# Generar token (desde interfaz web o script)
TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Enviar punto GPS
curl -X POST http://localhost:3000/api/track \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 40.4168,
    "longitude": -3.7038,
    "altitude": 667.5,
    "timestamp_utc": "2024-01-15T14:30:00Z",
    "speed": 15.3
  }'

# Consultar ruta completa
curl http://localhost:3000/api/tracks/ruta-madrid

# Consultar última posición
curl http://localhost:3000/api/tracks/ruta-madrid/latest
```

### Con JavaScript/Fetch

```javascript
// Enviar punto GPS
async function sendGPSPoint(token, point) {
  const response = await fetch('http://localhost:3000/api/track', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(point)
  });
  return response.json();
}

// Obtener ruta completa
async function getRoute(routeName) {
  const response = await fetch(`http://localhost:3000/api/tracks/${routeName}`);
  return response.json();
}

// Obtener última posición
async function getLatestPosition(routeName) {
  const response = await fetch(`http://localhost:3000/api/tracks/${routeName}/latest`);
  return response.json();
}
```

---

## Ejemplo Completo: Mapa en Tiempo Real con Leaflet

Este ejemplo muestra cómo crear un mapa que:
1. Carga toda la ruta histórica al inicio
2. Actualiza la posición actual cada 5 segundos

```html
<!DOCTYPE html>
<html>
<head>
    <title>GPS Tracker - Tiempo Real</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        #map { height: 100vh; width: 100%; }
        .current-position-marker {
            background: #e74c3c;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }
    </style>
</head>
<body>
    <div id="map"></div>
    
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Configuración
        const API_URL = 'http://localhost:3000';
        const ROUTE_NAME = 'ruta-madrid';
        const UPDATE_INTERVAL = 5000; // 5 segundos

        // Variables globales
        let map;
        let routeLayer = null;
        let currentMarker = null;

        // Inicializar mapa
        function initMap() {
            map = L.map('map').setView([40.4168, -3.7038], 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
        }

        // 1. Cargar ruta histórica completa (una sola vez)
        async function loadFullRoute() {
            try {
                const response = await fetch(`${API_URL}/api/tracks/${ROUTE_NAME}?format=geojson`);
                const geojson = await response.json();
                
                // Remover capa anterior si existe
                if (routeLayer) {
                    map.removeLayer(routeLayer);
                }
                
                // Crear capa con estilos personalizados
                routeLayer = L.geoJSON(geojson, {
                    // Estilo para la línea que conecta los puntos
                    style: {
                        color: '#3498db',
                        weight: 3,
                        opacity: 0.7
                    },
                    // Estilo para cada punto
                    pointToLayer: (feature, latlng) => {
                        return L.circleMarker(latlng, {
                            radius: 5,
                            fillColor: '#3498db',
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                    },
                    // Popup con información
                    onEachFeature: (feature, layer) => {
                        const props = feature.properties;
                        layer.bindPopup(`
                            <b>Velocidad:</b> ${props.speed || 'N/A'} km/h<br>
                            <b>Altitud:</b> ${props.altitude || 'N/A'} m<br>
                            <b>Hora:</b> ${new Date(props.timestamp).toLocaleString()}
                        `);
                    }
                }).addTo(map);
                
                // Ajustar vista al bounds de la ruta
                if (routeLayer.getBounds().isValid()) {
                    map.fitBounds(routeLayer.getBounds());
                }
                
                console.log(`✅ Ruta cargada: ${geojson.properties.total} puntos`);
                
            } catch (error) {
                console.error('❌ Error cargando ruta:', error);
            }
        }

        // 2. Actualizar posición actual (periódicamente)
        async function updateCurrentPosition() {
            try {
                const response = await fetch(`${API_URL}/api/tracks/${ROUTE_NAME}/latest?format=geojson`);
                
                if (!response.ok) {
                    throw new Error('No se pudo obtener la posición actual');
                }
                
                const point = await response.json();
                const [lon, lat] = point.geometry.coordinates;
                const props = point.properties;
                
                // Crear o actualizar marcador de posición actual
                if (!currentMarker) {
                    // Crear marcador personalizado
                    const icon = L.divIcon({
                        className: 'current-position-marker',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    
                    currentMarker = L.marker([lat, lon], { icon }).addTo(map);
                    
                    // Popup inicial
                    currentMarker.bindPopup(`
                        <b>📍 Posición Actual</b><br>
                        <b>Velocidad:</b> ${props.speed || 'N/A'} km/h<br>
                        <b>Altitud:</b> ${props.altitude || 'N/A'} m<br>
                        <b>Actualizado:</b> ${new Date().toLocaleTimeString()}
                    `);
                    
                    console.log('✅ Marcador de posición actual creado');
                    
                } else {
                    // Mover marcador existente (animación suave)
                    currentMarker.setLatLng([lat, lon]);
                    
                    // Actualizar popup
                    currentMarker.setPopupContent(`
                        <b>📍 Posición Actual</b><br>
                        <b>Velocidad:</b> ${props.speed || 'N/A'} km/h<br>
                        <b>Altitud:</b> ${props.altitude || 'N/A'} m<br>
                        <b>Actualizado:</b> ${new Date().toLocaleTimeString()}
                    `);
                }
                
                // Opcional: Centrar mapa suavemente en la posición actual
                // map.panTo([lat, lon], { animate: true, duration: 1 });
                
            } catch (error) {
                console.error('❌ Error actualizando posición:', error);
            }
        }

        // 3. Inicializar todo
        async function init() {
            initMap();
            
            // Cargar ruta histórica (una vez)
            await loadFullRoute();
            
            // Obtener posición actual inicial
            await updateCurrentPosition();
            
            // Actualizar posición cada X segundos (solo el último punto)
            setInterval(updateCurrentPosition, UPDATE_INTERVAL);
            
            // Opcional: Recargar ruta completa cada 1 minuto
            // (por si hay nuevos puntos desde otra sesión)
            setInterval(loadFullRoute, 60000);
            
            console.log('🚀 Tracker iniciado');
            console.log(`📍 Actualizando cada ${UPDATE_INTERVAL/1000} segundos`);
        }

        // Iniciar cuando el DOM esté listo
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>
```

### Características del ejemplo:

✅ **Eficiente**: Carga la ruta histórica una sola vez, luego solo pide el último punto  
✅ **Tiempo real**: Posición actual se actualiza cada 5 segundos  
✅ **Visual**: Marcador rojo pulsante indica posición actual  
✅ **Informativo**: Popups muestran velocidad, altitud y hora  
✅ **Adaptativo**: Mapa se ajusta automáticamente a los bounds de la ruta  

### Variaciones útiles:

```javascript
// Seguir al vehículo automáticamente
map.panTo([lat, lon]);

// Cambiar icono según velocidad
const icon = speed > 50 ? fastIcon : slowIcon;

// Trazar línea desde última posición
const newLatLng = [lat, lon];
if (lastPosition) {
    L.polyline([lastPosition, newLatLng], {color: 'red'}).addTo(map);
}
lastPosition = newLatLng;

// Mostrar alerta si no hay actualización en X tiempo
setTimeout(() => {
    if (Date.now() - lastUpdate > 30000) {
        alert('Sin señal GPS por más de 30 segundos');
    }
}, 30000);
```

---

## Configuración GPSLogger

En tu app GPSLogger, configura el envío automático:

**Settings → Logging details → Custom URL:**
- **URL:** `http://tu-servidor:3000/api/track`
- **HTTP Method:** POST
- **HTTP Headers:** 
  ```
  Authorization: Bearer <tu-token-jwt>
  Content-Type: application/json
  ```
- **HTTP Body:**
  ```
  {"latitude":%LAT,"longitude":%LON,"altitude":%ALT,"timestamp_utc":"%TIME","speed":%SPD}
  ```

**Intervalo recomendado:** 5-10 segundos para tiempo real, o 30-60 segundos para ahorrar batería.

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| 400 | Datos inválidos (validación falló) |
| 401 | Token no proporcionado |
| 403 | Token inválido o expirado |
| 404 | Ruta no encontrada |
| 429 | Demasiadas peticiones (rate limit) |
| 500 | Error interno del servidor |

---

## Notas de Seguridad

- Los tokens JWT expiran en 30 días
- Las contraseñas de admin son estáticas (definidas en .env)
- Rate limiting protege contra abuso
- Los endpoints de consulta son públicos por diseño

## Licencia

MIT
