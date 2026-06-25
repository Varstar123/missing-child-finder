// Face-fingerprint comparison. face-api gives a "distance" between two faces
// (0 = identical). We map it to a percentage: distance 0 -> 100%, 0.5 -> 80%.
// A match at/above MATCH_THRESHOLD_PERCENT is treated as a confident
// same-person match and creates an alert for the family.
const MATCH_THRESHOLD_PERCENT = 80;

function distanceToPercent(distance) {
  // 100 - 40*distance, clamped to 0..100. (0.5 -> 80, 0.6 -> 76, 1.0 -> 60)
  return Math.max(0, Math.min(100, Math.round(100 - 40 * distance)));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

module.exports = { MATCH_THRESHOLD_PERCENT, distanceToPercent, euclideanDistance };
