-- Розширення для генерації UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Розширення для EXCLUDE CONSTRAINT з типом tstzrange
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Таблиця користувачів
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця робочих місць (workspaces)
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'desk',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця бронювань
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- EXCLUDE CONSTRAINT: заборонити перетин часу для одного робочого місця
    CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (
        workspace_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status = 'confirmed')
);

-- Початкові дані: кілька робочих місць
INSERT INTO workspaces (name, type, status) VALUES
    ('Desk A1', 'desk', 'active'),
    ('Desk A2', 'desk', 'active'),
    ('Desk B1', 'desk', 'active'),
    ('Meeting Room 1', 'meeting_room', 'active'),
    ('Meeting Room 2', 'meeting_room', 'active'),
    ('Phone Booth 1', 'phone_booth', 'active');
