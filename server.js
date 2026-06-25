// Missing Child Finder — backend
// Stores reports of missing children and matches a "found" photo against them
// using face fingerprints computed in the browser by face-api.js.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4321;

// ---- Configuration ---------------------------------------------------------
// face-api gives a "distance" between two faces (0 = identical).
// We turn that into a percentage: distance 0 -> 100%, distance 0.5 -> 80%.
// A match at/above MATCH_THRESHOLD_PERCENT means the faces are a confident
// same-person match, and an alert is created for the family.
const MATCH_THRESHOLD_PERCENT = 80;

function distanceToPercent(distance) {
  // Linear: 100 - 40*distance, clamped to 0..100. (0.5 -> 80, 0.6 -> 76, 1.0 -> 60)
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

// ---- Simple JSON "database" ------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return { children: [], alerts: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { children: [], alerts: [] };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Save a base64 data URL (data:image/jpeg;base64,....) to a file, return its
// public path. Keeps photos out of the JSON file.
function saveDataUrl(dataUrl, prefix) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image data');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const buf = Buffer.from(m[3], 'base64');
  const name = `${prefix}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// ---- Notifying the family --------------------------------------------------
// In a real deployment this is where you would send an email / SMS to the
// registered guardian (and notify the relevant authorities). For this
// prototype we record the alert; the Alerts page shows what would be delivered.
function notifyFamily(alert) {
  console.log(
    `[ALERT] Possible match for "${alert.childName}" (${alert.matchPercent}%). ` +
    `Would notify guardian: ${alert.parentEmail || alert.parentPhone || 'n/a'}`
  );
  // To send real email, plug a mailer in here (e.g. nodemailer) using the
  // guardian contact stored on the child's report.
}

// ---- App -------------------------------------------------------------------
app.use(express.json({ limit: '12mb' })); // photos arrive as base64
app.use(express.static(path.join(__dirname, 'public')));

// Register a missing child.
app.post('/api/children', (req, res) => {
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

    const db = loadDb();
    const photoUrl = saveDataUrl(image, 'child');
    const child = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      ageWhenMissing: ageWhenMissing ? String(ageWhenMissing).trim() : '',
      dateMissing: String(dateMissing).trim(),
      parentName: String(parentName).trim(),
      parentEmail: parentEmail ? String(parentEmail).trim() : '',
      parentPhone: parentPhone ? String(parentPhone).trim() : '',
      photoUrl,
      descriptor,
      reportedAt: new Date().toISOString(),
    };
    db.children.push(child);
    saveDb(db);
    res.json({ ok: true, id: child.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save the report.' });
  }
});

// Search: a finder uploads a photo; compare against every missing child.
app.post('/api/search', (req, res) => {
  try {
    const { descriptor, image, finderName, finderContact, location, note } = req.body || {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'No clear face was found in the photo. Please use a clear, front-facing photo.' });
    }

    const db = loadDb();
    if (db.children.length === 0) {
      return res.json({ matches: [], threshold: MATCH_THRESHOLD_PERCENT });
    }

    // Score every child and keep those at/above the threshold.
    const scored = db.children
      .map((c) => {
        const dist = euclideanDistance(descriptor, c.descriptor);
        return { child: c, percent: distanceToPercent(dist) };
      })
      .filter((s) => s.percent >= MATCH_THRESHOLD_PERCENT)
      .sort((a, b) => b.percent - a.percent);

    // Save the finder's photo only if there is at least one match worth keeping.
    let foundPhotoUrl = null;
    const matches = scored.map((s) => {
      if (!foundPhotoUrl) foundPhotoUrl = saveDataUrl(image, 'found');
      const alert = {
        id: crypto.randomUUID(),
        childId: s.child.id,
        childName: s.child.name,
        childPhotoUrl: s.child.photoUrl,
        parentName: s.child.parentName,
        parentEmail: s.child.parentEmail,
        parentPhone: s.child.parentPhone,
        matchPercent: s.percent,
        foundPhotoUrl,
        finderName: finderName ? String(finderName).trim() : '',
        finderContact: finderContact ? String(finderContact).trim() : '',
        location: location ? String(location).trim() : '',
        note: note ? String(note).trim() : '',
        createdAt: new Date().toISOString(),
        status: 'unconfirmed',
      };
      db.alerts.push(alert);
      notifyFamily(alert);
      return {
        childName: s.child.name,
        ageWhenMissing: s.child.ageWhenMissing,
        dateMissing: s.child.dateMissing,
        childPhotoUrl: s.child.photoUrl,
        matchPercent: s.percent,
      };
    });

    if (matches.length > 0) saveDb(db);
    res.json({ matches, threshold: MATCH_THRESHOLD_PERCENT });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Search failed.' });
  }
});

// Count of registered children (shown on the home page).
app.get('/api/stats', (req, res) => {
  const db = loadDb();
  res.json({ children: db.children.length, alerts: db.alerts.length });
});

// Alerts the families would have received.
app.get('/api/alerts', (req, res) => {
  const db = loadDb();
  const alerts = [...db.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ alerts });
});

app.listen(PORT, () => {
  console.log(`Missing Child Finder running at http://localhost:${PORT}`);
});
