require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const app = express();

// Configuración CORS
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (CORS_ORIGIN) {
    const corsOptions = CORS_ORIGIN === '*' 
        ? { origin: true, credentials: false }
        : { origin: CORS_ORIGIN.split(',').map(o => o.trim()), credentials: true };
    app.use(cors(corsOptions));
    console.log(`🌐 CORS habilitado para: ${CORS_ORIGIN}`);
} else {
    console.log('🌐 CORS deshabilitado (sin CORS_ORIGIN en .env)');
}

// Configuración desde .env
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const DB_NAME = process.env.DB_NAME || 'apiLogger';

// Validar configuración
if (!JWT_SECRET || !ADMIN_USER || !ADMIN_PASS) {
    console.error('❌ Error: Faltan variables de entorno requeridas en .env');
    console.error('   Requeridas: ADMIN_USER, ADMIN_PASS, JWT_SECRET');
    process.exit(1);
}

// Configurar pool de conexiones MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Rate limiting específico por endpoint
const limiterGeneral = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

const limiterTrack = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Demasiadas peticiones GPS. Intenta más tarde.' }
});

const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos de login. Intenta más tarde.' }
});

const limiterAdmin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Demasiadas operaciones de administración. Intenta más tarde.' }
});

app.use('/api/track', limiterTrack);
app.use('/api/login', limiterLogin);
app.use('/api/', limiterGeneral);

// ============================================
// HELPERS
// ============================================

// Sanitizar nombre de ruta
function sanitizeRouteName(name) {
    if (!name || typeof name !== 'string') return null;
    // Solo permitir: letras, números, guiones y guiones bajos
    // Convertir a lowercase para consistencia
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100);
}

// Convertir fecha ISO 8601 a formato MySQL DATETIME
function toMySQLDateTime(dateInput) {
    // Si no hay entrada, usar fecha actual
    if (!dateInput) {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    // Si ya está en formato MySQL (sin T ni Z), devolverlo tal cual
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateInput)) {
        return dateInput;
    }

    try {
        // Intentar parsear como ISO 8601
        const date = new Date(dateInput);
        
        // Verificar si la fecha es válida
        if (isNaN(date.getTime())) {
            console.warn(`⚠️ Fecha inválida recibida: ${dateInput}, usando fecha actual`);
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
        
        // Convertir a formato MySQL: YYYY-MM-DD HH:MM:SS
        return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch (error) {
        console.warn(`⚠️ Error parseando fecha: ${dateInput}, usando fecha actual`);
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
}

// Validar coordenadas GPS
function validateCoordinates(lat, lon) {
    const errors = [];
    
    if (typeof lat !== 'number' || isNaN(lat)) {
        errors.push('Latitud debe ser un número');
    } else if (lat < -90 || lat > 90) {
        errors.push('Latitud debe estar entre -90 y 90');
    }
    
    if (typeof lon !== 'number' || isNaN(lon)) {
        errors.push('Longitud debe ser un número');
    } else if (lon < -180 || lon > 180) {
        errors.push('Longitud debe estar entre -180 y 180');
    }
    
    return errors;
}

// Validar datos de track
function validateTrackData(data) {
    const errors = [];
    const { latitude, longitude, altitude, speed } = data;

    // Validar coordenadas
    const coordErrors = validateCoordinates(latitude, longitude);
    errors.push(...coordErrors);

    // Validar altitud (opcional)
    if (altitude !== undefined && altitude !== null) {
        if (typeof altitude !== 'number' || isNaN(altitude)) {
            errors.push('Altitud debe ser un número');
        } else if (altitude < -500 || altitude > 9000) {
            errors.push('Altitud debe estar entre -500 y 9000 metros');
        }
    }

    // Validar velocidad (opcional)
    if (speed !== undefined && speed !== null) {
        if (typeof speed !== 'number' || isNaN(speed)) {
            errors.push('Velocidad debe ser un número');
        } else if (speed < 0 || speed > 500) {
            errors.push('Velocidad debe estar entre 0 y 500 km/h');
        }
    }

    return errors;
}

// Validar actualización parcial de un track
function validateTrackUpdate(data) {
    const errors = [];
    const { latitude, longitude, altitude, speed } = data;

    // Si se envía alguna coordenada, deben enviarse ambas
    if (latitude !== undefined || longitude !== undefined) {
        if (latitude === undefined || longitude === undefined) {
            errors.push('Si se editan coordenadas, deben enviarse latitud y longitud juntas');
        } else {
            errors.push(...validateCoordinates(latitude, longitude));
        }
    }

    // Validar altitud (opcional)
    if (altitude !== undefined && altitude !== null) {
        if (typeof altitude !== 'number' || isNaN(altitude)) {
            errors.push('Altitud debe ser un número');
        } else if (altitude < -500 || altitude > 9000) {
            errors.push('Altitud debe estar entre -500 y 9000 metros');
        }
    }

    // Validar velocidad (opcional)
    if (speed !== undefined && speed !== null) {
        if (typeof speed !== 'number' || isNaN(speed)) {
            errors.push('Velocidad debe ser un número');
        } else if (speed < 0 || speed > 500) {
            errors.push('Velocidad debe estar entre 0 y 500 km/h');
        }
    }

    return errors;
}

// Convertir puntos a GeoJSON
function toGeoJSON(points, routeName) {
    return {
        type: 'FeatureCollection',
        features: points.map(point => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [Number(point.longitude), Number(point.latitude)]
            },
            properties: {
                id: point.id,
                route_name: point.route_name,
                altitude: point.altitude !== null && point.altitude !== undefined ? Number(point.altitude) : null,
                speed: point.speed !== null && point.speed !== undefined ? Number(point.speed) : null,
                timestamp: point.timestamp_utc,
                created_at: point.created_at
            }
        })),
        properties: {
            route_name: routeName,
            total: points.length
        }
    };
}

// Middleware para verificar JWT en rutas protegidas
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.routeName = decoded.route_name;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

// Middleware para verificar sesión de administrador
// Acepta Authorization: Bearer <token> o sessionToken en el body (legacy)
const verifySession = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.body && req.body.sessionToken) {
        token = req.body.sessionToken;
    }

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'session') {
            throw new Error('Token inválido');
        }
        req.adminSession = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Sesión inválida o expirada' });
    }
};

// ============================================
// ENDPOINTS API
// ============================================

// Login de admin
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const sessionToken = jwt.sign(
            { type: 'session', user: ADMIN_USER },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        res.json({ success: true, token: sessionToken });
    } else {
        res.status(401).json({ error: 'Credenciales incorrectas' });
    }
});

// Generar token para una ruta GPS
app.post('/api/generate-token', verifySession, async (req, res) => {
    const { routeName } = req.body;

    const sanitizedName = sanitizeRouteName(routeName);
    if (!sanitizedName) {
        return res.status(400).json({ error: 'Nombre de ruta inválido' });
    }

    const routeToken = jwt.sign(
        { route_name: sanitizedName },
        JWT_SECRET,
        { expiresIn: '30d' }
    );

    res.json({
        success: true,
        token: routeToken,
        route_name: sanitizedName
    });
});

// Recibir datos GPS (protegido con JWT)
app.post('/api/track', verifyToken, async (req, res) => {
    const { latitude, longitude, altitude, timestamp_utc, speed } = req.body;

    // Validar datos
    const validationErrors = validateTrackData({ latitude, longitude, altitude, speed });
    if (validationErrors.length > 0) {
        return res.status(400).json({ 
            error: 'Datos inválidos', 
            details: validationErrors 
        });
    }

    try {
        const connection = await pool.getConnection();
        
        await connection.execute(
            `INSERT INTO tracks (route_name, latitude, longitude, altitude, timestamp_utc, speed)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.routeName,
                latitude,
                longitude,
                altitude ?? null,
                toMySQLDateTime(timestamp_utc),
                speed ?? null
            ]
        );

        connection.release();
        
        res.status(201).json({ 
            success: true, 
            message: 'Track guardado',
            route: req.routeName 
        });
    } catch (error) {
        console.error('❌ Error al guardar track:', error.message);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ 
                error: 'Tabla no encontrada. Ejecuta: npm run db:build' 
            });
        }
        
        res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }
});

// Obtener todos los puntos de una ruta
app.get('/api/tracks/:route_name', async (req, res) => {
    const routeName = sanitizeRouteName(req.params.route_name);
    const format = req.query.format;
    
    if (!routeName) {
        return res.status(400).json({ error: 'Nombre de ruta inválido' });
    }

    try {
        const connection = await pool.getConnection();
        
        // Obtener todos los puntos ordenados por fecha
        const [points] = await connection.execute(
            `SELECT id, route_name, latitude, longitude, altitude, 
                    timestamp_utc, speed, created_at 
             FROM tracks 
             WHERE route_name = ? 
             ORDER BY timestamp_utc ASC`,
            [routeName]
        );

        connection.release();

        if (points.length === 0) {
            return res.status(404).json({ 
                error: 'Ruta no encontrada o sin puntos' 
            });
        }

        // Responder según formato solicitado
        if (format === 'geojson') {
            res.json(toGeoJSON(points, routeName));
        } else {
            res.json({
                success: true,
                route: routeName,
                total: points.length,
                points: points
            });
        }
    } catch (error) {
        console.error('❌ Error al obtener tracks:', error.message);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

// Obtener el último punto de una ruta
app.get('/api/tracks/:route_name/latest', async (req, res) => {
    const routeName = sanitizeRouteName(req.params.route_name);
    const format = req.query.format;
    
    if (!routeName) {
        return res.status(400).json({ error: 'Nombre de ruta inválido' });
    }

    try {
        const connection = await pool.getConnection();
        
        const [points] = await connection.execute(
            `SELECT id, route_name, latitude, longitude, altitude, 
                    timestamp_utc, speed, created_at 
             FROM tracks 
             WHERE route_name = ? 
             ORDER BY timestamp_utc DESC 
             LIMIT 1`,
            [routeName]
        );

        connection.release();

        if (points.length === 0) {
            return res.status(404).json({ 
                error: 'Ruta no encontrada o sin puntos' 
            });
        }

        const point = points[0];

        if (format === 'geojson') {
            res.json({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.longitude, point.latitude]
                },
                properties: {
                    id: point.id,
                    route_name: point.route_name,
                    altitude: point.altitude,
                    speed: point.speed,
                    timestamp: point.timestamp_utc,
                    created_at: point.created_at
                }
            });
        } else {
            res.json({
                success: true,
                route: routeName,
                point: point
            });
        }
    } catch (error) {
        console.error('❌ Error al obtener último punto:', error.message);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

// Obtener lista de todas las rutas (para el mapa)
app.get('/api/routes/all', async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Obtener todas las rutas con info resumida, ordenadas por última actualización
        const [routes] = await connection.execute(
            `SELECT
                route_name as name,
                COUNT(*) as total_points,
                MAX(timestamp_utc) as last_updated
             FROM tracks
             GROUP BY route_name
             ORDER BY last_updated DESC`
        );

        connection.release();

        res.json({
            success: true,
            total: routes.length,
            routes: routes
        });
    } catch (error) {
        console.error('❌ Error al obtener rutas:', error.message);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

// Borrar una ruta completa (admin)
app.delete('/api/routes/:route_name', verifySession, limiterAdmin, async (req, res) => {
    const routeName = sanitizeRouteName(req.params.route_name);
    if (!routeName) {
        return res.status(400).json({ error: 'Nombre de ruta inválido' });
    }

    try {
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'DELETE FROM tracks WHERE route_name = ?',
            [routeName]
        );
        connection.release();

        res.json({
            success: true,
            deleted: result.affectedRows,
            route: routeName
        });
    } catch (error) {
        console.error('❌ Error al borrar ruta:', error.message);
        res.status(500).json({ error: 'Error al borrar la ruta' });
    }
});

// Borrar un punto por ID (admin)
app.delete('/api/tracks/:id', verifySession, limiterAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'DELETE FROM tracks WHERE id = ?',
            [id]
        );
        connection.release();

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Punto no encontrado' });
        }

        res.json({ success: true, id });
    } catch (error) {
        console.error('❌ Error al borrar punto:', error.message);
        res.status(500).json({ error: 'Error al borrar el punto' });
    }
});

// Actualizar un punto por ID (admin, parcial)
app.put('/api/tracks/:id', verifySession, limiterAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    const { latitude, longitude, altitude, speed, timestamp_utc } = req.body;
    const updates = {};
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (altitude !== undefined) updates.altitude = altitude;
    if (speed !== undefined) updates.speed = speed;
    if (timestamp_utc !== undefined) updates.timestamp_utc = timestamp_utc;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    const validationErrors = validateTrackUpdate({ latitude, longitude, altitude, speed });
    if (validationErrors.length > 0) {
        return res.status(400).json({
            error: 'Datos inválidos',
            details: validationErrors
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(key === 'timestamp_utc' ? toMySQLDateTime(value) : value);
        }
        values.push(id);

        const [result] = await connection.execute(
            `UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Punto no encontrado' });
        }

        const [rows] = await connection.execute(
            `SELECT id, route_name, latitude, longitude, altitude,
                    timestamp_utc, speed, created_at
             FROM tracks WHERE id = ?`,
            [id]
        );

        res.json({ success: true, point: rows[0] });
    } catch (error) {
        console.error('❌ Error al actualizar punto:', error.message);
        res.status(500).json({ error: 'Error al actualizar el punto' });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint de salud
app.get('/api/health', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        connection.release();
        res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

async function startServer() {
    // Verificar conexión a base de datos antes de iniciar
    try {
        console.log('🔌 Verificando conexión a MySQL...');
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        console.log('✅ Conexión a base de datos establecida\n');
    } catch (error) {
        console.error('❌ Error: No se puede conectar a MySQL\n');
        console.error('Mensaje:', error.message);
        console.error('\n💡 Verifica que:');
        console.error('   - MySQL esté corriendo');
        console.error('   - Las credenciales en .env sean correctas');
        console.error('   - Hayas ejecutado: npm run db:build\n');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log('========================================');
        console.log('  🚀 GPS Logger API');
        console.log('========================================\n');
        console.log(`Servidor: http://localhost:${PORT}`);
        console.log(`Interfaz: http://localhost:${PORT}`);
        console.log(`API GPS:  POST http://localhost:${PORT}/api/track`);
        console.log(`API GET:  GET  http://localhost:${PORT}/api/tracks/:route_name`);
        console.log(`API Last: GET  http://localhost:${PORT}/api/tracks/:route_name/latest`);
        console.log(`API List: GET  http://localhost:${PORT}/api/routes/all`);
        console.log(`API Admin:DELETE http://localhost:${PORT}/api/routes/:route_name`);
        console.log(`API Admin:DELETE http://localhost:${PORT}/api/tracks/:id`);
        console.log(`API Admin:PUT    http://localhost:${PORT}/api/tracks/:id\n`);
        console.log('📖 Parámetros GET:');
        console.log('   ?format=geojson  - Formato GeoJSON para Leaflet\n');
        console.log('💻 Comandos:');
        console.log('   npm run db:build  - Crear base de datos');
        console.log('   npm start         - Iniciar servidor');
        console.log('   npm run dev       - Desarrollo con recarga\n');
    });
}

startServer();
