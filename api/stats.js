// GET /api/stats — counts shown on the home page.
const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  try {
    const sb = getSupabase();
    const c = await sb.from('children').select('*', { count: 'exact', head: true });
    const a = await sb.from('alerts').select('*', { count: 'exact', head: true });
    if (c.error) throw new Error(c.error.message);
    if (a.error) throw new Error(a.error.message);
    res.json({ children: c.count || 0, alerts: a.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load stats.' });
  }
};
