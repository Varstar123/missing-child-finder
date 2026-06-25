// Loads the face-api.js models once and turns an uploaded photo into a
// 128-number "face fingerprint" (descriptor) that the server can compare.
//
// Detection is deliberately robust so realistic everyday phone photos succeed:
//   1. The image is decoded with EXIF orientation baked in (fixes sideways
//      portraits), then huge photos are downscaled and tiny ones upscaled so
//      the face sits in a size range the detectors were trained on.
//   2. We try SSD MobileNet v1 at a lowered confidence (catches faces the
//      0.5 default silently dropped), picking the LARGEST face.
//   3. If SSD finds nothing we fall back to TinyFaceDetector across several
//      input sizes (a different architecture that often catches small/angled
//      faces SSD misses).
//   4. Landmarks + descriptor run once on the single chosen face, so the
//      output is always one aligned 128-dimension descriptor — exactly what
//      server.js requires (Array.isArray && length === 128).
const MODEL_URL = '/models';

// ---- Tunable knobs ---------------------------------------------------------
// Longest edge (px) the detection input is clamped to. Phone photos are often
// 3000-4000px; running SSD + several Tiny passes on those is slow and can
// exhaust the WebGL backend. Faces are internally resized to ~150px for
// recognition anyway, so 1600 keeps plenty of detail.
const MAX_DETECT_EDGE = 1600;
// Smallest edge (px) we accept before upscaling. A small/distant face needs
// enough pixels for the detector's receptive field to fire.
const MIN_DETECT_EDGE = 640;
// Never invent more than this much detail when upscaling tiny inputs.
const MAX_UPSCALE = 3;
// A face whose box is narrower than this fraction of the image width is too
// small/unreliable to fingerprint, so we ask for a closer photo instead of
// silently storing a low-quality descriptor.
const MIN_FACE_WIDTH_FRACTION = 0.05;
// JPEG quality for the re-encoded, orientation-corrected image we store.
const STORED_JPEG_QUALITY = 0.9;

// Detection cascade. Each stage is tried in order; the first stage that finds
// at least one face wins. SSD stages come first so well-lit, ordinary photos
// keep today's quality and never pay the multi-scale Tiny cost.
function buildStages() {
  const stages = [
    { kind: 'ssd', opts: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }) },
    { kind: 'ssd', opts: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }) },
  ];
  // TinyFaceDetector is optional: only add it if its weights actually loaded,
  // so a missing model degrades gracefully to SSD-only rather than crashing.
  if (faceapi.nets.tinyFaceDetector && faceapi.nets.tinyFaceDetector.isLoaded) {
    // inputSize must be divisible by 32. Larger = better recall on small faces
    // (slower); 320 last as a cheap catch for big, close faces.
    stages.push(
      { kind: 'tiny', opts: new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }) },
      { kind: 'tiny', opts: new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }) },
      { kind: 'tiny', opts: new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.2 }) },
      { kind: 'tiny', opts: new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }) }
    );
  }
  return stages;
}

let modelsReady = null;

async function loadModels() {
  if (!modelsReady) {
    modelsReady = (async () => {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      // TinyFaceDetector is a small (~190KB) fallback detector. If its weights
      // are missing we still want SSD detection to work, so absence is
      // non-fatal — the cascade just skips the Tiny stages.
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      } catch (err) {
        console.warn('TinyFaceDetector weights not available; using SSD only.', err);
      }
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })();
  }
  return modelsReady;
}

// ---- Image decoding & preprocessing ---------------------------------------

// Decode a File into an upright canvas. createImageBitmap with
// imageOrientation:'from-image' bakes EXIF rotation into the actual pixels,
// which is the single biggest fix for "sideways phone photo = no face". Falls
// back to an <img> for browsers that ignore the option (older Safari).
async function decodeToCanvas(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/.test(type)) {
    throw new Error(
      'This looks like an iPhone HEIC photo, which browsers cannot open. ' +
      'Please re-save or export it as a JPG or PNG and try again.'
    );
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bitmap = null; // fall through to the <img> path
  }

  if (bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    if (!canvas.width || !canvas.height) {
      throw new Error('We could not open that image. Please try a JPG or PNG photo.');
    }
    return canvas;
  }

  // Fallback: load via <img> (browsers auto-apply EXIF when rendering an <img>).
  const img = await loadViaImgTag(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

function loadViaImgTag(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error('We could not open that image. Please try a JPG or PNG photo.'));
        } else {
          resolve(img);
        }
      };
      img.onerror = () => reject(new Error('We could not open that image. Please try a JPG or PNG photo.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('We could not read that file. Please try a different photo.'));
    reader.readAsDataURL(file);
  });
}

// Clamp the canvas so its longest edge sits within [MIN_DETECT_EDGE,
// MAX_DETECT_EDGE]: downscale huge photos, upscale tiny ones (capped). Returns
// the same canvas when no resize is needed.
function normalizeSize(src) {
  const w = src.width;
  const h = src.height;
  const longest = Math.max(w, h);
  let scale = 1;
  if (longest > MAX_DETECT_EDGE) {
    scale = MAX_DETECT_EDGE / longest;
  } else if (longest < MIN_DETECT_EDGE) {
    scale = Math.min(MIN_DETECT_EDGE / longest, MAX_UPSCALE);
  }
  if (scale === 1) return src;

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

// ---- Detection cascade -----------------------------------------------------

function boxArea(box) {
  return box.width * box.height;
}

// Run the cascade and return the winning stage's detector options, or null.
// Detector-only passes (no landmarks/descriptor) are cheap, so we run them
// first and only compute the expensive descriptor once, on the winner.
async function findBestStage(input) {
  const stages = buildStages();
  for (const stage of stages) {
    const dets = await faceapi.detectAllFaces(input, stage.opts);
    if (dets && dets.length) {
      // Largest box = the dominant subject in a group/wide shot.
      dets.sort((a, b) => (boxArea(b.box) - boxArea(a.box)) || (b.score - a.score));
      return { opts: stage.opts, best: dets[0] };
    }
  }
  return null;
}

// ---- Public API ------------------------------------------------------------

// Returns { descriptor: number[128], dataUrl } or throws a friendly error.
async function describeFace(file) {
  await loadModels();

  // 1. Decode (EXIF-correct) and size-normalize for detection.
  const raw = await decodeToCanvas(file);
  const input = normalizeSize(raw);

  // 2. Find the single best face via the detector cascade.
  const stage = await findBestStage(input);
  if (!stage) {
    throw new Error(
      'We could not find a face in this photo. Please use a clear photo where ' +
      "the child's face is clearly visible and well lit."
    );
  }

  // 3. Reject faces too small to fingerprint reliably.
  if (stage.best.box.width / input.width < MIN_FACE_WIDTH_FRACTION) {
    throw new Error(
      'We found a face, but it is too small or unclear to use. ' +
      'Please use a closer, sharper photo of the face.'
    );
  }

  // 4. Compute landmarks + descriptor on the chosen face. Re-run the winning
  //    detector with the SAME options, then re-select the largest face so the
  //    descriptor corresponds to the subject the cascade picked. Using the
  //    same options guarantees the face is found again.
  const results = await faceapi
    .detectAllFaces(input, stage.opts)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!results || !results.length) {
    // The detector saw a box but landmarks/descriptor rejected it (often a
    // false-positive non-face blob from a loose threshold).
    throw new Error(
      'We found something that looked like a face, but could not read it clearly. ' +
      'Please use a clearer, front-facing photo.'
    );
  }

  results.sort(
    (a, b) =>
      (boxArea(b.detection.box) - boxArea(a.detection.box)) ||
      (b.detection.score - a.detection.score)
  );
  const chosen = results[0];

  const descriptor = Array.from(chosen.descriptor);
  if (descriptor.length !== 128) {
    throw new Error(
      'We found a face, but could not compute its fingerprint. ' +
      'Please try a clearer, front-facing photo.'
    );
  }

  // 5. Store the orientation-corrected, normalized image as JPEG so the saved
  //    photo is upright and reasonably sized, and matches the analyzed pixels.
  //    (Accepted by server.js's data:image/(png|jpeg|jpg|webp) check.)
  const dataUrl = input.toDataURL('image/jpeg', STORED_JPEG_QUALITY);

  return { descriptor, dataUrl };
}
