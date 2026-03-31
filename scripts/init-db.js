#!/usr/bin/env node

/**
 * Script de inicialización de base de datos
 * Uso: npm run db:build
 * 
 * Este script crea la base de datos y las tablas necesarias
 * para el funcionamiento de GPS Logger API.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'apiLogger';

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
};

async function initializeDatabase() {
    console.log('========================================');
    console.log('  GPS Logger API - Database Builder');
    console.log('========================================\n');
    
    console.log('🔌 Conectando a MySQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   User: ${config.user}\n`);
    
    let connection;
    
    try {
        // Conectar sin base de datos específica
        connection = await mysql.createConnection(config);
        console.log('✅ Conexión establecida\n');
        
        // 1. Crear base de datos si no existe
        console.log(`📦 Creando base de datos '${DB_NAME}'...`);
        await connection.execute(
            `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` 
             CHARACTER SET utf8mb4 
             COLLATE utf8mb4_unicode_ci`
        );
        console.log('   ✅ Base de datos lista\n');
        
        // 2. Usar la base de datos
        await connection.execute(`USE \`${DB_NAME}\``);
        
        // 3. Crear tabla tracks si no existe
        console.log('📋 Verificando tabla tracks...');
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS tracks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                route_name VARCHAR(255) NOT NULL,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                altitude DECIMAL(8, 2),
                timestamp_utc DATETIME NOT NULL,
                speed DECIMAL(6, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_route_name (route_name),
                INDEX idx_timestamp (timestamp_utc)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('   ✅ Tabla tracks lista\n');
        
        // 4. Verificar que todo funciona
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM tracks');
        console.log(`📊 Registros actuales en tracks: ${rows[0].count}\n`);
        
        console.log('========================================');
        console.log('  ✅ Base de datos inicializada');
        console.log('========================================\n');
        
        console.log('Puedes iniciar el servidor con:');
        console.log('  npm start\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error al inicializar base de datos:\n');
        console.error('   ', error.message);
        console.error('\n💡 Verifica que:');
        console.error('   - MySQL esté corriendo');
        console.error('   - Las credenciales en .env sean correctas');
        console.error('   - El usuario tenga permisos para crear bases de datos');
        console.error('\nConfiguración actual:');
        console.error(`   DB_HOST: ${config.host}`);
        console.error(`   DB_USER: ${config.user}`);
        console.error(`   DB_NAME: ${DB_NAME}\n`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Ejecutar
initializeDatabase();
