// Stores uploaded photos in a public Supabase Storage bucket and returns their
// public URL. Photos are kept out of the database (only the URL is stored).
const crypto = require('crypto');

const BUCKET = 'photos';

// Parse a data URL (data:image/jpeg;base64,....) into its parts.
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image data.');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  return { contentType: m[1], ext, buffer: Buffer.from(m[3], 'base64') };
}

// Upload a data URL to the bucket under <prefix>/<random>.<ext>; return its URL.
async function uploadImage(supabase, dataUrl, prefix) {
  const { contentType, ext, buffer } = parseDataUrl(dataUrl);
  const objectName = `${prefix}/${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectName, buffer, { contentType, upsert: false });
  if (error) throw new Error('Could not store the photo: ' + error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
  return data.publicUrl;
}

module.exports = { parseDataUrl, uploadImage, BUCKET };
