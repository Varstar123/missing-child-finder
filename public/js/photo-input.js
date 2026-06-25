// Reusable photo picker used on the "Report" and "I found a child" pages.
//
// It gives the visitor two clear, styled choices instead of the browser's
// default file box:
//   • "Choose a photo"  → pick an existing image from the device/gallery.
//   • "Take a photo"     → on a phone or laptop, open the live camera and
//                          capture a photo right now (via getUserMedia). On
//                          older mobile browsers without getUserMedia we fall
//                          back to the native camera using an <input capture>.
//
// Whatever path is used, the result is a single File handed back through the
// onChange callback, so the existing describeFace(file) pipeline is unchanged.
(function () {
  // Build the camera overlay lazily the first time it's needed.
  function buildCameraModal() {
    const modal = document.createElement('div');
    modal.className = 'cam-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Take a photo');
    modal.innerHTML =
      '<div class="cam-box">' +
      '  <video class="cam-video" playsinline autoplay muted></video>' +
      '  <p class="cam-msg" hidden></p>' +
      '  <div class="cam-actions">' +
      '    <button type="button" class="btn-primary cam-shoot">Capture photo</button>' +
      '    <button type="button" class="btn-soft cam-switch" hidden>Flip camera</button>' +
      '    <button type="button" class="btn-ghost cam-cancel">Cancel</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function initPhotoPicker(options) {
    options = options || {};
    const onChange = options.onChange || function () {};

    const fileInput = document.getElementById('photo'); // gallery / files
    const captureInput = document.getElementById('photoCapture'); // native camera fallback
    const chooseBtn = document.getElementById('chooseBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const preview = document.getElementById('preview');
    const clearBtn = document.getElementById('clearPhotoBtn');

    let currentFile = null;
    let previewUrl = null;

    function setFile(file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
      currentFile = file || null;
      if (currentFile) {
        previewUrl = URL.createObjectURL(currentFile);
        preview.src = previewUrl;
        preview.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'inline-block';
      } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
      }
      onChange(currentFile);
    }

    // ---- Choose from device ------------------------------------------------
    chooseBtn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        fileInput.value = '';
        if (captureInput) captureInput.value = '';
        setFile(null);
      });
    }

    // ---- Take a photo (live camera) ---------------------------------------
    const supportsLiveCamera = !!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    );

    let modal = null;
    let stream = null;
    let facing = 'environment'; // back camera by default — good for photographing someone

    function stopStream() {
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }
    }

    function closeModal() {
      stopStream();
      if (modal) modal.classList.remove('open');
    }

    async function startStream() {
      const video = modal.querySelector('.cam-video');
      const msg = modal.querySelector('.cam-msg');
      const shoot = modal.querySelector('.cam-shoot');
      stopStream();
      msg.hidden = true;
      video.hidden = false;
      shoot.disabled = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play().catch(function () {});
      } catch (err) {
        // No camera / permission denied: hide the empty black box and disable
        // capture so the modal reads as a tidy message, not a broken view.
        video.hidden = true;
        shoot.disabled = true;
        msg.hidden = false;
        msg.textContent =
          'Could not open the camera. Please allow camera access, or close this ' +
          'and use "Choose a photo" instead.';
      }
    }

    async function openLiveCamera() {
      if (!modal) {
        modal = buildCameraModal();
        modal.querySelector('.cam-cancel').addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) {
          if (e.target === modal) closeModal();
        });
        modal.querySelector('.cam-switch').addEventListener('click', function () {
          facing = facing === 'environment' ? 'user' : 'environment';
          startStream();
        });
        modal.querySelector('.cam-shoot').addEventListener('click', function () {
          const video = modal.querySelector('.cam-video');
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            function (blob) {
              if (!blob) return;
              const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
              closeModal();
              setFile(file);
            },
            'image/jpeg',
            0.92
          );
        });
        // Show "Flip camera" only when more than one camera is likely present.
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices
            .enumerateDevices()
            .then(function (devices) {
              const cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
              if (cams.length > 1) modal.querySelector('.cam-switch').hidden = false;
            })
            .catch(function () {});
        }
      }
      modal.classList.add('open');
      startStream();
    }

    cameraBtn.addEventListener('click', function () {
      if (supportsLiveCamera) {
        openLiveCamera();
      } else if (captureInput) {
        captureInput.click(); // native camera app on older mobile browsers
      } else {
        fileInput.click();
      }
    });

    if (captureInput) {
      captureInput.addEventListener('change', function () {
        if (captureInput.files && captureInput.files[0]) setFile(captureInput.files[0]);
      });
    }

    return {
      getFile: function () { return currentFile; },
      reset: function () {
        fileInput.value = '';
        if (captureInput) captureInput.value = '';
        setFile(null);
      },
    };
  }

  window.initPhotoPicker = initPhotoPicker;
})();
