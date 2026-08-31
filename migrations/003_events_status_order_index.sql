-- events_overview.sql orders by a CASE that buckets status open/locked/other,
-- then created_at DESC. A computed ordering cannot be served by an index on
-- `status` itself, so every event was read and sorted in a temp b-tree to
-- return the first 200.
--
-- SQLite indexes expressions, so the bucket can be stored precomputed. The CASE
-- must be written EXACTLY as the query writes it — the planner matches index
-- expressions by structure, and a reordered WHEN or a different ELSE is a
-- different expression that will not be used. Change the two together.
--
-- `status` and `created_at` are both plaintext (status is a skip-encrypt
-- column), so the index orders real values.
CREATE INDEX IF NOT EXISTS app_prediction_league__events_status_order_idx
  ON app_prediction_league__events (
    (CASE status WHEN 'open' THEN 0 WHEN 'locked' THEN 1 ELSE 2 END),
    created_at DESC
  );
