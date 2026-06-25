const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const results = document.getElementById('results');

// Styled "Choose / Take a photo" picker (public/js/photo-input.js).
const picker = initPhotoPicker({ onChange: () => { results.innerHTML = ''; } });

function setStatus(kind, msg) {
  statusEl.className = 'status ' + kind;
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

function renderMatches(matches) {
  if (matches.length === 0) {
    results.innerHTML =
      '<div class="status info" style="display:block">No strong match was found among the registered children. ' +
      'Thank you for checking — please still report the child to your local authorities.</div>';
    return;
  }
  let html =
    '<div class="status success" style="display:block">A possible match was found. ' +
    'The family has been alerted with the photo you uploaded.</div>';
  for (const m of matches) {
    html +=
      '<div class="match">' +
      '<img src="' + m.childPhotoUrl + '" alt="Registered photo of ' + m.childName + '" />' +
      '<div>' +
      '<div class="pct">' + m.matchPercent + '% match</div>' +
      '<div><strong>' + m.childName + '</strong></div>' +
      (m.ageWhenMissing ? '<div>Age when missing: ' + m.ageWhenMissing + '</div>' : '') +
      '<div>Missing since: ' + m.dateMissing + '</div>' +
      '</div></div>';
  }
  results.innerHTML = html;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = picker.getFile();
  if (!file) return setStatus('error', 'Please choose or take a photo.');

  submitBtn.disabled = true;
  results.innerHTML = '';
  setStatus('info', 'Reading the photo and checking for a face… (the first time may take a few seconds)');

  try {
    const { descriptor, dataUrl } = await describeFace(file);

    setStatus('info', 'Comparing against registered children…');
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

    statusEl.className = 'status';
    statusEl.style.display = 'none';
    renderMatches(data.matches);
  } catch (err) {
    setStatus('error', err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
