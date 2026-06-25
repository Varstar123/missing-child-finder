const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');

// Styled "Choose / Take a photo" picker (public/js/photo-input.js).
const picker = initPhotoPicker();

function setStatus(kind, msg) {
  statusEl.className = 'status ' + kind;
  statusEl.textContent = msg;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = picker.getFile();
  if (!file) return setStatus('error', 'Please choose or take a photo.');

  submitBtn.disabled = true;
  setStatus('info', 'Reading the photo and checking for a face… (the first time may take a few seconds)');

  try {
    const { descriptor, dataUrl } = await describeFace(file);

    const body = {
      name: form.name.value,
      ageWhenMissing: form.ageWhenMissing.value,
      dateMissing: form.dateMissing.value,
      parentName: form.parentName.value,
      parentEmail: form.parentEmail.value,
      parentPhone: form.parentPhone.value,
      descriptor,
      image: dataUrl,
    };

    setStatus('info', 'Saving the report…');
    const res = await fetch('/api/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save the report.');

    setStatus('success', 'Report saved. We will alert you by email or text if a matching photo is uploaded.');
    form.reset();
    picker.reset();
  } catch (err) {
    setStatus('error', err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
