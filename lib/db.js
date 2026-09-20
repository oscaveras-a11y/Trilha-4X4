const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(
  path.join(dataDir, "trilha4x4.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    terms_accepted_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trails (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    visibility TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    start_at TEXT NOT NULL,
    planned_end_at TEXT NOT NULL,
    release_at TEXT,
    safety_end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,

    FOREIGN KEY (creator_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trail_members (
    trail_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TEXT NOT NULL,

    PRIMARY KEY (trail_id, user_id),

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  /*
   * Veículo cadastrado pelo usuário.
   */
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    color TEXT,
    plate TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  /*
   * Solicitações para participar
   * de uma trilha.
   */
  CREATE TABLE IF NOT EXISTS trail_join_requests (
    id TEXT PRIMARY KEY,
    trail_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    vehicle_type TEXT NOT NULL,
    vehicle_brand TEXT NOT NULL,
    vehicle_model TEXT NOT NULL,
    vehicle_year INTEGER,
    vehicle_color TEXT,
    vehicle_plate TEXT,
    vehicle_notes TEXT,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (reviewed_by)
      REFERENCES users(id)
      ON DELETE SET NULL
  );

  /* Rota planejada pelo criador/administrador da trilha. */
  CREATE TABLE IF NOT EXISTS trail_route_points (
    id TEXT PRIMARY KEY,
    trail_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE,

    UNIQUE (trail_id, position)
  );

  CREATE TABLE IF NOT EXISTS trail_location_points (
    id TEXT PRIMARY KEY,
    trail_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    recorded_at TEXT NOT NULL,

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trail_safety_events (
    id TEXT PRIMARY KEY,
    trail_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    extension_hours INTEGER,
    created_at TEXT NOT NULL,

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (creator_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,

    PRIMARY KEY (group_id, user_id),

    FOREIGN KEY (group_id)
      REFERENCES groups(id)
      ON DELETE CASCADE,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_trails (
    group_id TEXT NOT NULL,
    trail_id TEXT NOT NULL,
    added_at TEXT NOT NULL,

    PRIMARY KEY (group_id, trail_id),

    FOREIGN KEY (group_id)
      REFERENCES groups(id)
      ON DELETE CASCADE,

    FOREIGN KEY (trail_id)
      REFERENCES trails(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

  CREATE INDEX IF NOT EXISTS idx_trail_members_user_id
    ON trail_members(user_id);

  CREATE INDEX IF NOT EXISTS idx_vehicles_user_id
    ON vehicles(user_id);

  CREATE INDEX IF NOT EXISTS idx_join_requests_trail_id
    ON trail_join_requests(trail_id);

  CREATE INDEX IF NOT EXISTS idx_join_requests_user_id
    ON trail_join_requests(user_id);

  CREATE INDEX IF NOT EXISTS idx_join_requests_status
    ON trail_join_requests(status);

  CREATE INDEX IF NOT EXISTS idx_route_points_trail_position
    ON trail_route_points(trail_id, position);

  CREATE INDEX IF NOT EXISTS idx_location_points_trail_time
    ON trail_location_points(trail_id, recorded_at);

  CREATE INDEX IF NOT EXISTS idx_location_points_user_time
    ON trail_location_points(user_id, recorded_at);

  CREATE INDEX IF NOT EXISTS idx_safety_events_trail_time
    ON trail_safety_events(trail_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_group_members_user_id
    ON group_members(user_id);

  CREATE INDEX IF NOT EXISTS idx_group_trails_trail_id
    ON group_trails(trail_id);
`);

module.exports = db;