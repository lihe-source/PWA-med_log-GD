-- Run once in Cloudflare D1. Contains no credentials or example user data.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspaces (
 id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 synced_at INTEGER, checked_at INTEGER, last_result TEXT NOT NULL DEFAULT '尚未執行排程'
);
CREATE TABLE IF NOT EXISTS devices (
 workspace TEXT NOT NULL, device_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL, subscription TEXT, endpoint_hash TEXT, enabled INTEGER NOT NULL DEFAULT 0,
 vapid_key TEXT, last_test INTEGER, updated_at INTEGER NOT NULL,
 PRIMARY KEY(workspace,device_id), FOREIGN KEY(workspace) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS one_device_per_endpoint ON devices(endpoint_hash) WHERE endpoint_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS events (
 workspace TEXT NOT NULL, event_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(workspace,event_id),
 FOREIGN KEY(workspace) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS deliveries (
 workspace TEXT NOT NULL, device_id TEXT NOT NULL, day TEXT NOT NULL, at_time TEXT NOT NULL,
 state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, last_http INTEGER, updated_at INTEGER NOT NULL,
 PRIMARY KEY(workspace,device_id,day,at_time)
);
CREATE TABLE IF NOT EXISTS limits (
 id TEXT PRIMARY KEY, minute INTEGER NOT NULL, count INTEGER NOT NULL
);
