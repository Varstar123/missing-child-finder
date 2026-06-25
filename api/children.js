// POST /api/children — register a missing child.
const { getSupabase } = require('../lib/supabase');
const { uploadImage } = require('../lib/storage');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const {
      name, ageWhenMissing, dateMissing,
      parentName, parentEmail, parentPhone,
      descriptor, image,
    } = req.body || {};

    if (!name || !dateMissing || !parentName) {
      return res.status(400).json({ error: 'Name, date missing, and guardian name are required.' });
    }
    if (!parentEmail && !parentPhone) {
      return res.status(400).json({ error: 'Please provide a guardian email or phone so the family can be alerted.' });
    }
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'No clear face was found in the photo. Please use a clear, front-facing photo.' });
    }

    const sb = getSupabase();
    const photoUrl = await uploadImage(sb, image, 'children');
    const { data, error } = await sb
      .from('children')
      .insert({
        name: String(name).trim(),
        age_when_missing: ageWhenMissing ? String(ageWhenMissing).trim() : '',
        date_missing: String(dateMissing).trim(),
        parent_name: String(parentName).trim(),
        parent_email: parentEmail ? String(parentEmail).trim() : '',
        parent_phone: parentPhone ? String(parentPhone).trim() : '',
        photo_url: photoUrl,
        descriptor,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    res.json({ ok: true, id: data.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save the report.' });
  }
};
