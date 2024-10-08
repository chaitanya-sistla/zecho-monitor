-- Create the 'postgres' role if it doesn't exist
DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres'
    ) THEN
        CREATE ROLE postgres WITH LOGIN PASSWORD 'password';
        GRANT ALL PRIVILEGES ON DATABASE uptime_monitor TO postgres;
    END IF;
END
$$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Create monitors table
CREATE TABLE IF NOT EXISTS monitors (
    id SERIAL PRIMARY KEY,
    url VARCHAR(255) NOT NULL,
    status VARCHAR(50),
    ssl_expiry VARCHAR(50),
    last_checked TIMESTAMP
);

-- Create monitor_history table
CREATE TABLE IF NOT EXISTS monitor_history (
    id SERIAL PRIMARY KEY,
    monitor_id INT,
    status VARCHAR(50),
    ssl_expiry VARCHAR(50),
    checked_at TIMESTAMP
);

-- Drop existing foreign key constraint (if exists)
ALTER TABLE IF EXISTS monitor_history
DROP CONSTRAINT IF EXISTS monitor_history_monitor_id_fkey;

-- Add foreign key constraint with ON DELETE CASCADE
ALTER TABLE monitor_history
ADD CONSTRAINT monitor_history_monitor_id_fkey
FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE;

