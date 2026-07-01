// GET /api/alerts — alerts the families would have received (newest first).
// RESTRICTED: alerts contain sensitive child/family data, so this endpoint is
// only served to a signed-in authorized admin (see lib/auth.js). Everyone else
// gets 401 and the page shows the login gate instead.
const { getSupabase } = require('../lib/supabase');
const { getSessionEmail } = require('../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!getSessionEmail(req)) {
      return res.status(401).json({ error: 'Not authorized. Please sign in as authorized personnel.' });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    // Map snake_case columns to the camelCase the frontend expects.
    const alerts = (data || []).map((a) => ({
      childName: a.child_name,
      childPhotoUrl: a.child_photo_url,
      parentName: a.parent_name,
      parentEmail: a.parent_email,
      parentPhone: a.parent_phone,
      matchPercent: a.match_percent,
      foundPhotoUrl: a.found_photo_url,
      finderName: a.finder_name,
      finderContact: a.finder_contact,
      location: a.location,
      note: a.note,
      createdAt: a.created_at,
      status: a.status,
    }));
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load alerts.' });
  }
};
