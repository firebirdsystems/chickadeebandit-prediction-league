-- Events now expire after two years, cascading their predictions. This is what
-- makes "archive" more than a soft flag: predictions are frozen by frozen_when
-- once an event locks, so app SQL can never remove them and an archived event
-- previously lived (and loaded) forever.
CREATE INDEX IF NOT EXISTS app_prediction_league__events_retention_idx
  ON app_prediction_league__events (created_at, id);
