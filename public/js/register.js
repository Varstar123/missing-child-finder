const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('preview');

function setStatus(kind, msg) {
  statusEl.className = 'status ' + kind;
  statusEl.textContent = msg;
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = photoInput.files[0];
  if (!file) return setStatus('error', 'Please choose a photo.');

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

    setStatus('success', 'Report saved. We will create an alert for you if a matching photo is uploaded.');
    form.reset();
    preview.style.display = 'none';
  } catch (err) {
    setStatus('error', err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
