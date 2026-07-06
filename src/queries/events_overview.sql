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
