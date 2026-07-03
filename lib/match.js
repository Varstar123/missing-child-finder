// Face-fingerprint comparison. face-api gives a "distance" between two faces
// (0 = identical). We map it to a percentage: distance 0 -> 100%, 0.5 -> 80%.
//
// A STRONG match is at/above MATCH_THRESHOLD_PERCENT (80%). That is treated as a
// confident same-person match: it creates an alert AND notifies the family.
//
// Children — especially young ones — change a lot as they grow, so a true match
// photographed years later can score well below 80%. To avoid silently dropping
// those, the match threshold is RELAXED as the time since the child went missing
// grows (and more so the younger they were), down to MATCH_FLOOR_PERCENT. These
// "wider age-gap" matches are surfaced for human review but, being lower
// confidence, do NOT auto-notify the family (see api/search.js).
const MATCH_THRESHOLD_PERCENT = 80; // strong match: alert + notify family
const MATCH_FLOOR_PERCENT = 70;     // lowest threshold after age-gap relaxation

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

// Whole (fractional) years elapsed since an ISO date string, never negative.
function yearsSince(dateStr) {
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 0;
  return Math.max(0, (Date.now() - then.getTime()) / (365.25 * 24 * 3600 * 1000));
}

// The minimum match% to treat as a possible match for THIS child. Starts at the
// strong threshold and drops as the child has been missing longer — faster for
// younger children, whose faces change most — bottoming out at the floor.
function ageAwareThreshold(dateMissing, ageWhenMissing) {
  const years = yearsSince(dateMissing);
  const age = Number(ageWhenMissing);
  let ratePerYear;
  if (Number.isFinite(age) && age >= 0) {
    ratePerYear = age <= 5 ? 2.5 : age <= 12 ? 2.0 : 1.2; // younger => relax more
  } else {
    ratePerYear = 2.0; // unknown age => moderate
  }
  const relaxed = MATCH_THRESHOLD_PERCENT - years * ratePerYear;
  return Math.max(MATCH_FLOOR_PERCENT, Math.round(relaxed));
}

module.exports = {
  MATCH_THRESHOLD_PERCENT,
  MATCH_FLOOR_PERCENT,
  distanceToPercent,
  euclideanDistance,
  yearsSince,
  ageAwareThreshold,
};
