// Pure, browser-free prediction + scoring logic. Unit-tested in
// __tests__/logic.test.mjs. No DOM, no hub globals, no DB calls here.

import { isAdult } from "./shared.js";
export { isAdult };

export const EVENT_TYPES = ["choice", "number", "date", "text"];
export const STATUS_ORDER = { open: 0, locked: 1, revealed: 2 };

// ── Event lifecycle helpers ──────────────────────────────────────────────────

export function isOpen(event) { return event?.status === "open"; }
export function isLocked(event) { return event?.status === "locked"; }
export function isRevealed(event) { return event?.status === "revealed"; }

// Predictions may only be created/edited while the event is open.
export function canPredict(event) { return isOpen(event); }

// Only adults create events and drive the open → locked → revealed lifecycle.
export function canManageEvents(member) { return isAdult(member); }

// ── Value parsing / normalization ────────────────────────────────────────────

export function normalizeText(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Numeric value of a prediction/answer for number/date events. Returns a finite
// number, or null when the raw value can't be interpreted for that type.
export function numericValue(type, raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  if (type === "number") {
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  if (type === "date") {
    const t = Date.parse(String(raw).trim());
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

// Human-readable rendering of a stored prediction/answer value.
export function displayValue(event, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (event.type === "choice") {
    const opt = (event.options || []).find(o => o.id === value);
    return opt ? opt.label : String(value);
  }
  if (event.type === "number") {
    const n = numericValue("number", value);
    const base = n === null ? String(value) : n.toLocaleString();
    return event.unit ? `${base} ${event.unit}` : base;
  }
  if (event.type === "date") {
    const t = numericValue("date", value);
    if (t === null) return String(value);
    return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return String(value);
}

// Validate a raw prediction input for an event. Returns { ok, value?, error? }.
// `value` is the canonical string to store.
export function validatePrediction(event, raw) {
  const type = event.type;
  if (type === "choice") {
    const ids = new Set((event.options || []).map(o => o.id));
    if (!ids.has(raw)) return { ok: false, error: "Pick one of the options." };
    return { ok: true, value: raw };
  }
  if (type === "number") {
    const n = numericValue("number", raw);
    if (n === null) return { ok: false, error: "Enter a number." };
    return { ok: true, value: String(n) };
  }
  if (type === "date") {
    const t = numericValue("date", raw);
    if (t === null) return { ok: false, error: "Enter a valid date." };
    // store as YYYY-MM-DD for stable comparison/display
    return { ok: true, value: new Date(t).toISOString().slice(0, 10) };
  }
  // text
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Enter your prediction." };
  return { ok: true, value: text };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

// Score a single event against its predictions. `event` must have `type`,
// `points`, `correct_answer`, and (for choice) `options`. `predictions` is the
// array of { member_id, member_name, value, note } for that event.
//
// Returns { scored, results } where results is sorted best-first and each entry
// has: { member_id, member_name, value, diff, exact, won, earned }.
export function scoreEvent(event, predictions) {
  const points = Number(event.points) || 1;
  const answerSet = event.correct_answer !== null && event.correct_answer !== undefined && event.correct_answer !== "";
  const scored = isRevealed(event) && answerSet;

  const base = (predictions || []).map(p => ({
    member_id: p.member_id,
    member_name: p.member_name,
    value: p.value,
    note: p.note ?? "",
    diff: null,
    exact: false,
    won: false,
    earned: 0,
  }));

  if (!scored) return { scored: false, results: base };

  if (event.type === "choice" || event.type === "text") {
    const target = event.type === "text" ? normalizeText(event.correct_answer) : event.correct_answer;
    for (const r of base) {
      const got = event.type === "text" ? normalizeText(r.value) : r.value;
      r.exact = got === target;
      r.won = r.exact;
      r.earned = r.won ? points : 0;
    }
  } else {
    // number / date: closest wins; ties all win.
    const target = numericValue(event.type, event.correct_answer);
    let minDiff = Infinity;
    for (const r of base) {
      const n = numericValue(event.type, r.value);
      r.diff = n === null || target === null ? null : Math.abs(n - target);
      if (r.diff !== null && r.diff < minDiff) minDiff = r.diff;
    }
    for (const r of base) {
      if (r.diff !== null && r.diff === minDiff) {
        r.won = true;
        r.exact = r.diff === 0;
        r.earned = points;
      }
    }
  }

  const results = [...base].sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.diff !== null && b.diff !== null && a.diff !== b.diff) return a.diff - b.diff;
    return String(a.member_name).localeCompare(String(b.member_name));
  });

  return { scored: true, results };
}

// Aggregate a leaderboard across all revealed events.
// `events` is an array of event objects; `predictionsByEvent` maps event id →
// prediction array. Returns rows sorted by points desc, wins desc, exacts desc,
// then name, each { member_id, name, points, wins, exacts, played }.
export function computeLeaderboard(events, predictionsByEvent) {
  const rows = new Map();
  const ensure = (id, name) => {
    let r = rows.get(id);
    if (!r) { r = { member_id: id, name, points: 0, wins: 0, exacts: 0, played: 0 }; rows.set(id, r); }
    else if (name && r.name === "Unknown") r.name = name;
    return r;
  };

  for (const event of events) {
    if (!isRevealed(event)) continue;
    const preds = predictionsByEvent[event.id] || [];
    const { scored, results } = scoreEvent(event, preds);
    for (const res of results) {
      const r = ensure(res.member_id, res.member_name || "Unknown");
      r.played += 1;
      if (scored) {
        r.points += res.earned;
        if (res.won) r.wins += 1;
        if (res.exact) r.exacts += 1;
      }
    }
  }

  return [...rows.values()].sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.exacts - a.exacts ||
    String(a.name).localeCompare(String(b.name))
  );
}
