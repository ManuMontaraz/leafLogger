-- ============================================
-- SQL de referencia (ya no necesitas ejecutarlo manualmente)
-- ============================================
-- 
-- ⚠️  NOTA: El servidor ahora inicializa la base de datos automáticamente.
--     Este archivo es solo para referencia de la estructura.
--
-- Si necesitas crear la base de datos manualmente por algún motivo,
-- ejecuta estos comandos en MySQL:
--
--     mysql -u root -p < database.sql
--
-- Pero normalmente NO es necesario: el servidor lo hace solo al iniciar.
-- ============================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS apiLogger 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE apiLogger;

-- Tabla para almacenar tracks GPS
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
