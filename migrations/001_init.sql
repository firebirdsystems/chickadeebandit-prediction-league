-- Prediction League schema
--
-- events       — the question everyone predicts (parent). adult_writable.
--                status: 'open' (accepting predictions) → 'locked' (frozen, event
--                underway) → 'revealed' (answer set, predictions visible + scored).
-- predictions  — one sealed entry per member per event (child, sealed_until).
--                Hidden from non-owners until the parent event is 'revealed';
--                frozen once the parent is 'locked' or 'revealed'.

CREATE TABLE IF NOT EXISTS app_prediction_league__events (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT 'choice',   -- 'choice' | 'number' | 'date' | 'text'
  options_json   TEXT NOT NULL DEFAULT '[]',       -- choices for type='choice'
  unit           TEXT NOT NULL DEFAULT '',         -- optional label for type='number' (e.g. "jellybeans")
  correct_answer TEXT,                             -- set on reveal; NULL until then
  points         INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
  lock_at        TEXT NOT NULL DEFAULT '',         -- optional informational "closes at" date/time
  status         TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'locked' | 'revealed'
  created_by     TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  revealed_at    TEXT,
  archived       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_prediction_league__predictions (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  member_name TEXT NOT NULL,
  value       TEXT NOT NULL,          -- option id, number-as-text, date, or free text
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES app_prediction_league__events(id) ON DELETE CASCADE,
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS app_prediction_league__events_archived_idx
  ON app_prediction_league__events(archived, created_at DESC);

CREATE INDEX IF NOT EXISTS app_prediction_league__predictions_event_idx
  ON app_prediction_league__predictions(event_id);

CREATE INDEX IF NOT EXISTS app_prediction_league__predictions_member_idx
  ON app_prediction_league__predictions(member_id);
