const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('preview');
const results = document.getElementById('results');

function setStatus(kind, msg) {
  statusEl.className = 'status ' + kind;
  statusEl.textContent = msg;
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  results.innerHTML = '';
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

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
  const file = photoInput.files[0];
  if (!file) return setStatus('error', 'Please choose a photo.');

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
