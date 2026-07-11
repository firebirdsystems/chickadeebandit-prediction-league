# Prediction League 🔮

Everyone predicts the same events — Oscars, the big game, "how many jellybeans in
the jar," "when will the baby arrive" — with **one sealed entry per member per
event**. Predictions stay hidden until an adult reveals the outcome, then they're
scored together on a leaderboard.

This is *everyone-vs-the-question* (distinct from Bet Book's member-vs-member
wagers). Simultaneous sealed reveal is the whole game mechanic — nobody can see
anyone else's guess (or even that they've guessed) until the reveal, so early
predictions don't anchor later ones.

---

## How it works

**Event lifecycle** (adults drive it):

1. **Open** — members submit and edit their own sealed prediction. Each member
   sees only their own entry.
2. **Locked** — an adult locks the event (e.g. the game kicks off). Predictions
   are frozen: no more submissions or edits. Everything is still sealed.
3. **Revealed** — an adult enters the real outcome. Every prediction becomes
   visible at once and the leaderboard updates.

**Prediction types & scoring:**

| Type | Example | Scoring |
|---|---|---|
| Multiple choice | Best Picture winner | exact match earns the event's points |
| Closest number | Jellybeans in the jar | closest guess wins; ties share the win |
| Closest date | When will the baby arrive | closest date wins |
| Free answer | Who wins the game | normalized (case/space-insensitive) exact match |

Each event is worth a configurable number of points; the leaderboard totals
points, wins, and exact hits across all revealed events.

---

## Security model (`row_policies`)

- **`events`** — `adult_writable`: everyone reads, only adults create/lock/reveal.
- **`predictions`** — `sealed_until` the parent event is `revealed`, with:
  - `max_per_member` scoped to `event_id` → one entry per member per event.
  - `frozen_when` the parent status is `locked` or `revealed` → entries become
    immutable once the event locks.

These are enforced by the hub *before* SQL reaches the database — a member can't
peek at, forge, or edit a sealed prediction by POSTing raw SQL. See
`scenarios.json` for the end-to-end checks.

---

## Quick start

```bash
npm install
npm test            # unit-tests the scoring/validation logic
npm run dev         # preview locally (demo data, no DB)
npm run build       # produces dist/bundle.json to install in the hub
```
