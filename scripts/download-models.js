// Downloads the face-api.js library + the model weights into /public so the
// site works reliably without depending on a CDN at runtime.
// Run once with:  npm run setup
const fs = require('fs');
const path = require('path');

const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api';
const LIB_URL = `${CDN}/dist/face-api.js`;
const MODEL_BASE = `${CDN}/model`;

// The three models we need: detect a face, find its landmarks, and compute the
// 128-number "face fingerprint" used for comparison.
const MODELS = [
  'ssd_mobilenetv1',     // primary, accurate detector
  'tiny_face_detector',  // lightweight fallback detector (catches faces SSD misses)
  'face_landmark_68',
  'face_recognition',
];

const PUBLIC = path.join(__dirname, '..', 'public');
const VENDOR_DIR = path.join(PUBLIC, 'vendor');
const MODELS_DIR = path.join(PUBLIC, 'models');

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function save(dir, name, buf) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  console.log(`  saved ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  console.log('Downloading face-api.js library...');
  await save(VENDOR_DIR, 'face-api.js', await fetchBuffer(LIB_URL));

  for (const model of MODELS) {
    console.log(`Downloading model "${model}"...`);
    const manifestName = `${model}_model-weights_manifest.json`;
    const manifestBuf = await fetchBuffer(`${MODEL_BASE}/${manifestName}`);
    await save(MODELS_DIR, manifestName, manifestBuf);

    // The manifest lists the binary shard files that hold the weights.
    const manifest = JSON.parse(manifestBuf.toString('utf8'));
    const shardPaths = new Set();
    for (const group of manifest) {
      for (const p of group.paths) shardPaths.add(p);
    }
    for (const shard of shardPaths) {
      await save(MODELS_DIR, shard, await fetchBuffer(`${MODEL_BASE}/${shard}`));
    }
  }

  console.log('\nDone. Models are in public/models and the library in public/vendor.');
}

main().catch((err) => {
  console.error('\nDownload failed:', err.message);
  console.error('Check your internet connection and try "npm run setup" again.');
  process.exit(1);
});
