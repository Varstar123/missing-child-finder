const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const results = document.getElementById('results');

// Styled "Choose / Take a photo" picker (public/js/photo-input.js).
const picker = initPhotoPicker({ onChange: () => { results.innerHTML = ''; } });

function setStatus(kind, msg) {
  statusEl.className = 'status ' + kind;
  statusEl.style.display = ''; // clear any inline display:none from a previous run
  statusEl.textContent = msg;
}

// ---- Auto-fetch location ----------------------------------------------------
// Fills the "where did you see the child" box from the device's GPS. Manual
// typing still works; this is just a shortcut. We try to turn the coordinates
// into a readable place name (OpenStreetMap), and fall back to the raw
// latitude/longitude if that lookup is unavailable.
const locBtn = document.getElementById('locBtn');
const locInput = document.getElementById('location');
const locStatus = document.getElementById('locStatus');

if (locBtn) {
  locBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      locStatus.textContent = 'Your browser does not support location. Please type the place instead.';
      return;
    }
    locBtn.disabled = true;
    locStatus.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const coords = latitude.toFixed(5) + ', ' + longitude.toFixed(5);
        try {
          const r = await fetch(
            'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=' +
              latitude + '&lon=' + longitude,
            { headers: { Accept: 'application/json' } }
          );
          const data = await r.json();
          locInput.value = (data && data.display_name) ? data.display_name : coords;
        } catch (_) {
          locInput.value = coords;
        }
        locStatus.textContent = 'Location filled in — you can edit it if needed.';
        locBtn.disabled = false;
      },
      (err) => {
        locStatus.textContent =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Please type the place instead.'
            : 'Could not get your location. Please type the place instead.';
        locBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Detect once; used to choose the reduced/disabled animation paths.
const prefersReduced =
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// renderMatches now delegates to the dedicated result-view module, which draws
// the match / no-match reveals (dispatch notice, family alert, confidence ring,
// match cards). Kept as a named function so nothing else needs to change.
function renderMatches(matches) {
  window.renderResultView(results, matches, { reduceMotion: prefersReduced });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = picker.getFile();
  if (!file) return setStatus('error', 'Please choose or take a photo.');

  submitBtn.disabled = true;
  results.innerHTML = '';

  // The #status region is aria-live="polite"; these plain-language messages
  // double as the screen-reader narration that runs in parallel with the
  // visual (aria-hidden) scan overlay.
  setStatus('info', 'Analyzing the photo and comparing against registered children…');

  // Mount the biometric scan overlay over the user's ACTUAL uploaded photo.
  const frame = document.getElementById('previewFrame');
  const scan = (frame && window.createScanOverlay) ? window.createScanOverlay(frame) : null;
  if (scan) scan.start();

  try {
    // ---- Real async work (UNCHANGED logic; no progress events available) ----
    const { descriptor, dataUrl } = await describeFace(file);

    setStatus('info', 'Comparing against registered children…');
    if (scan) scan.compare();               // advance HUD to "Comparing…"

    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descriptor,
        image: dataUrl,
        location: form.location.value,
        finderName: form.finderName.value,
        finderContact: form.finderContact.value,
        note: form.note.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed.');

    // ---- Persist-until-resolved + minimum duration -----------------------
    // The real work is done; finish() waits out any remaining MIN_DURATION,
    // then fades the overlay out. The overlay can NEVER end before this point,
    // because finish() is only CALLED here, after both awaits above.
    if (scan) await scan.finish();

    // Hide the text status visually; keep a concise spoken summary in the
    // live region for screen-reader users (set BEFORE hiding so it announces).
    setStatus('info',
      data.matches.length
        ? 'A possible match was found. The family has been alerted and an alert ' +
          'was dispatched to the nearest police station.'
        : 'No strong match was found. Please still contact your local authorities.');
    statusEl.style.display = 'none';

    renderMatches(data.matches);
  } catch (err) {
    if (scan) scan.abort();                 // remove the overlay immediately on error
    setStatus('error', err.message);        // calm error styling, never a buzzer
  } finally {
    submitBtn.disabled = false;
  }
});
