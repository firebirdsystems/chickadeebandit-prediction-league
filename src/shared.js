// Mirrors the handful of hub-sdk.js helpers that pure logic needs, so
// logic.js can be unit-tested without loading the browser-only SDK.

export function isAdult(member) {
  return !!member && member.role === "adult";
}
