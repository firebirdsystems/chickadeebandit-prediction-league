import { describe, it, expect } from "vitest";
import {
  validatePrediction, scoreEvent, computeLeaderboard, displayValue,
  numericValue, canPredict, canManageEvents, isRevealed,
} from "../src/logic.js";

const adult = { id: "a", name: "Alex", role: "adult" };
const kid = { id: "k", name: "Casey", role: "child" };

const choiceEvent = (overrides = {}) => ({
  id: "e1", type: "choice", points: 3, status: "revealed", correct_answer: "o2",
  options: [{ id: "o1", label: "A" }, { id: "o2", label: "B" }, { id: "o3", label: "C" }],
  ...overrides,
});

describe("permissions", () => {
  it("only adults manage events", () => {
    expect(canManageEvents(adult)).toBe(true);
    expect(canManageEvents(kid)).toBe(false);
    expect(canManageEvents(null)).toBe(false);
  });
  it("predictions allowed only while open", () => {
    expect(canPredict({ status: "open" })).toBe(true);
    expect(canPredict({ status: "locked" })).toBe(false);
    expect(canPredict({ status: "revealed" })).toBe(false);
  });
});

describe("validatePrediction", () => {
  it("choice must match an option id", () => {
    const ev = choiceEvent();
    expect(validatePrediction(ev, "o1")).toEqual({ ok: true, value: "o1" });
    expect(validatePrediction(ev, "nope").ok).toBe(false);
  });
  it("number parses and strips commas", () => {
    const r = validatePrediction({ type: "number" }, "1,234");
    expect(r).toEqual({ ok: true, value: "1234" });
    expect(validatePrediction({ type: "number" }, "abc").ok).toBe(false);
  });
  it("date canonicalizes to YYYY-MM-DD", () => {
    const r = validatePrediction({ type: "date" }, "2026-08-01");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-08-01");
    expect(validatePrediction({ type: "date" }, "not a date").ok).toBe(false);
  });
  it("text requires non-empty", () => {
    expect(validatePrediction({ type: "text" }, "  Boston  ")).toEqual({ ok: true, value: "Boston" });
    expect(validatePrediction({ type: "text" }, "   ").ok).toBe(false);
  });
});

describe("scoreEvent — choice", () => {
  it("awards points to exact match only", () => {
    const preds = [
      { member_id: "a", member_name: "Alex", value: "o2" },
      { member_id: "k", member_name: "Casey", value: "o1" },
    ];
    const { scored, results } = scoreEvent(choiceEvent(), preds);
    expect(scored).toBe(true);
    const alex = results.find(r => r.member_id === "a");
    const casey = results.find(r => r.member_id === "k");
    expect(alex.won).toBe(true);
    expect(alex.earned).toBe(3);
    expect(casey.won).toBe(false);
    expect(casey.earned).toBe(0);
  });
  it("is not scored until revealed with an answer", () => {
    expect(scoreEvent(choiceEvent({ status: "locked" }), []).scored).toBe(false);
    expect(scoreEvent(choiceEvent({ correct_answer: null }), []).scored).toBe(false);
  });
});

describe("scoreEvent — number (closest wins, ties share)", () => {
  const ev = { type: "number", points: 2, status: "revealed", correct_answer: "412" };
  it("closest guess wins even without exact", () => {
    const preds = [
      { member_id: "a", member_name: "Alex", value: "400" },   // off by 12
      { member_id: "b", member_name: "Bo", value: "500" },     // off by 88
      { member_id: "c", member_name: "Casey", value: "410" },  // off by 2  ← winner
    ];
    const { results } = scoreEvent(ev, preds);
    const winners = results.filter(r => r.won);
    expect(winners.map(w => w.member_id)).toEqual(["c"]);
    expect(winners[0].earned).toBe(2);
    expect(winners[0].exact).toBe(false);
  });
  it("ties both win full points and exact is flagged", () => {
    const preds = [
      { member_id: "a", member_name: "Alex", value: "410" },
      { member_id: "b", member_name: "Bo", value: "414" },
      { member_id: "c", member_name: "Casey", value: "412" }, // exact
    ];
    const { results } = scoreEvent(ev, preds);
    const casey = results.find(r => r.member_id === "c");
    expect(casey.won).toBe(true);
    expect(casey.exact).toBe(true);
    // 410 and 414 are both off by 2 — they tie for second, not winners
    expect(results.filter(r => r.won).map(r => r.member_id)).toEqual(["c"]);
  });
  it("two-way tie at min distance both win", () => {
    const preds = [
      { member_id: "a", member_name: "Alex", value: "410" }, // off by 2
      { member_id: "b", member_name: "Bo", value: "414" },   // off by 2
    ];
    const { results } = scoreEvent(ev, preds);
    expect(results.filter(r => r.won).map(r => r.member_id).sort()).toEqual(["a", "b"]);
  });
});

describe("scoreEvent — date closest", () => {
  it("scores by day distance", () => {
    const ev = { type: "date", points: 5, status: "revealed", correct_answer: "2026-07-10" };
    const preds = [
      { member_id: "a", member_name: "Alex", value: "2026-07-05" },
      { member_id: "b", member_name: "Bo", value: "2026-07-09" }, // 1 day off ← winner
    ];
    const { results } = scoreEvent(ev, preds);
    expect(results[0].member_id).toBe("b");
    expect(results[0].won).toBe(true);
  });
});

describe("scoreEvent — text normalized match", () => {
  it("matches case/space-insensitively", () => {
    const ev = { type: "text", points: 1, status: "revealed", correct_answer: "New York" };
    const preds = [
      { member_id: "a", member_name: "Alex", value: "new york" },
      { member_id: "b", member_name: "Bo", value: "Boston" },
    ];
    const { results } = scoreEvent(ev, preds);
    expect(results.find(r => r.member_id === "a").won).toBe(true);
    expect(results.find(r => r.member_id === "b").won).toBe(false);
  });
});

describe("computeLeaderboard", () => {
  it("aggregates points, wins, exacts, played across revealed events only", () => {
    const events = [
      choiceEvent({ id: "e1", correct_answer: "o2", points: 3 }),
      { id: "e2", type: "number", points: 2, status: "revealed", correct_answer: "100" },
      { id: "e3", type: "choice", points: 10, status: "open", correct_answer: null, options: [] }, // ignored
    ];
    const byEvent = {
      e1: [
        { member_id: "a", member_name: "Alex", value: "o2" }, // win +3 exact
        { member_id: "k", member_name: "Casey", value: "o1" },
      ],
      e2: [
        { member_id: "a", member_name: "Alex", value: "90" },  // off 10
        { member_id: "k", member_name: "Casey", value: "101" }, // off 1 ← win +2
      ],
      e3: [{ member_id: "a", member_name: "Alex", value: "o1" }],
    };
    const board = computeLeaderboard(events, byEvent);
    const alex = board.find(r => r.member_id === "a");
    const casey = board.find(r => r.member_id === "k");
    expect(alex.points).toBe(3);
    expect(alex.wins).toBe(1);
    expect(alex.exacts).toBe(1);
    expect(alex.played).toBe(2); // e1 + e2, not the open e3
    expect(casey.points).toBe(2);
    expect(casey.wins).toBe(1);
    // Alex ranks first on points
    expect(board[0].member_id).toBe("a");
  });
});

describe("displayValue", () => {
  it("renders choice labels, numbers with unit, dates", () => {
    expect(displayValue(choiceEvent(), "o3")).toBe("C");
    expect(displayValue({ type: "number", unit: "jellybeans" }, "412")).toBe("412 jellybeans");
    expect(displayValue({ type: "text" }, "")).toBe("—");
  });
});
