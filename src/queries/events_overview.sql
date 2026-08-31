SELECT
  id,
  title,
  type,
  status,
  unit,
  points,
  correct_answer,
  lock_at,
  created_by_name,
  created_at,
  revealed_at
FROM app_prediction_league__events
ORDER BY
  CASE status WHEN 'open' THEN 0 WHEN 'locked' THEN 1 ELSE 2 END,
  created_at DESC
LIMIT 200
-- app_prediction_league__events_status_order_idx indexes this CASE as an
-- expression index. The planner matches index expressions structurally, so a
-- reordered WHEN or a changed ELSE silently drops back to a full scan and a
-- temp b-tree — change the migration with it.
