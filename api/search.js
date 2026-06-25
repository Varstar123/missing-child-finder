// POST /api/search — compare an uploaded photo against every registered child.
const { getSupabase } = require('../lib/supabase');
const { uploadImage } = require('../lib/storage');
const { euclideanDistance, distanceToPercent, MATCH_THRESHOLD_PERCENT } = require('../lib/match');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { descriptor, image, finderName, finderContact, location, note } = req.body || {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'No clear face was found in the photo. Please use a clear, front-facing photo.' });
    }

    const sb = getSupabase();
    const { data: children, error } = await sb.from('children').select('*');
    if (error) throw new Error(error.message);
    if (!children || children.length === 0) {
      return res.json({ matches: [], threshold: MATCH_THRESHOLD_PERCENT });
    }

    // Score every child; keep those at/above the threshold, strongest first.
    const scored = children
      .map((c) => ({ child: c, percent: distanceToPercent(euclideanDistance(descriptor, c.descriptor)) }))
      .filter((s) => s.percent >= MATCH_THRESHOLD_PERCENT)
      .sort((a, b) => b.percent - a.percent);

    if (scored.length === 0) {
      return res.json({ matches: [], threshold: MATCH_THRESHOLD_PERCENT });
    }

    // Store the finder's photo once, then record an alert per matched child.
    const foundPhotoUrl = await uploadImage(sb, image, 'found');
    const alertRows = scored.map((s) => ({
      child_id: s.child.id,
      child_name: s.child.name,
      child_photo_url: s.child.photo_url,
      parent_name: s.child.parent_name,
      parent_email: s.child.parent_email,
      parent_phone: s.child.parent_phone,
      match_percent: s.percent,
      found_photo_url: foundPhotoUrl,
      finder_name: finderName ? String(finderName).trim() : '',
      finder_contact: finderContact ? String(finderContact).trim() : '',
      location: location ? String(location).trim() : '',
      note: note ? String(note).trim() : '',
      status: 'unconfirmed',
    }));
    const { error: insErr } = await sb.from('alerts').insert(alertRows);
    if (insErr) throw new Error(insErr.message);

    // In production, this is where you would email/text the guardian
    // (e.g. via Resend, Twilio, or a Supabase Edge Function) using the
    // parent_email / parent_phone on each matched child.

    const matches = scored.map((s) => ({
      childName: s.child.name,
      ageWhenMissing: s.child.age_when_missing,
      dateMissing: s.child.date_missing,
      childPhotoUrl: s.child.photo_url,
      matchPercent: s.percent,
    }));
    res.json({ matches, threshold: MATCH_THRESHOLD_PERCENT });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Search failed.' });
  }
};
