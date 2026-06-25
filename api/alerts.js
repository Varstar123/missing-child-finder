// GET /api/alerts — alerts the families would have received (newest first).
const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  try {
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
