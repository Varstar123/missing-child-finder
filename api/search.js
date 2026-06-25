// POST /api/search — compare an uploaded photo against every registered child.
const { getSupabase } = require('../lib/supabase');
const { uploadImage } = require('../lib/storage');
const { euclideanDistance, distanceToPercent, MATCH_THRESHOLD_PERCENT } = require('../lib/match');
const { notifyGuardian } = require('../lib/notify');

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
    const { data: inserted, error: insErr } = await sb
      .from('alerts')
      .insert(alertRows)
      .select('id, child_name, match_percent, parent_email, parent_phone, found_photo_url, location');
    if (insErr) throw new Error(insErr.message);

    // Deliver the alert to each matched family by email and/or SMS. This is
    // best-effort: a delivery failure (or no provider configured) must not fail
    // the search — the alert is already recorded and shown on the Alerts page.
    await Promise.all(
      (inserted || []).map(async (row) => {
        try {
          const result = await notifyGuardian({
            childName: row.child_name,
            matchPercent: row.match_percent,
            parentEmail: row.parent_email,
            parentPhone: row.parent_phone,
            location: row.location,
            foundPhotoUrl: row.found_photo_url,
          });
          await sb
            .from('alerts')
            .update({ notified: result.sent, notify_error: result.error || null })
            .eq('id', row.id);
        } catch (err) {
          // Swallow — notification problems should never break the response.
          console.error('Alert delivery failed:', err.message);
        }
      })
    );

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
