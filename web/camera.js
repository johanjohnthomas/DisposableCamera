export const filters = [
  { key: 'golden', name: 'Warm 400', css: 'sepia(.3) saturate(1.2)' },
  { key: 'original', name: 'Daylight', css: 'none' },
  { key: 'mono', name: 'Silver B&W', css: 'grayscale(1) contrast(1.12)' },
  { key: 'cool', name: 'Blue hour', css: 'saturate(.8) hue-rotate(12deg)' },
];
export const photoLimits = Object.freeze({ width: 1280, height: 960, maxBytes: 500000 });
let stream;
export function stopCamera(video) {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
}
export async function startCamera(video) {
  stopCamera(video);
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this camera in Safari or Chrome over HTTPS. Camera access is unavailable here.');
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: photoLimits.width }, height: { ideal: photoLimits.height } } });
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
}
function applyFilm(data, filter) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (filter === 'mono') {
      const gray = (r * .299 + g * .587 + b * .114 - 128) * 1.12 + 128;
      data[i] = data[i + 1] = data[i + 2] = gray;
    } else if (filter === 'golden') {
      data[i] = r * 1.07 + 8; data[i + 1] = g * 1.02 + 3; data[i + 2] = b * .88 + 5;
    } else if (filter === 'cool') {
      data[i] = r * .92; data[i + 1] = g * 1.01 + 3; data[i + 2] = b * 1.08 + 8;
    }
  }
}
export async function capture(video, filter) {
  if (!video.videoWidth || video.readyState < 2) throw new Error('The camera is starting. Try again.');
  const canvas = document.createElement('canvas');
  // Match the 4:3 cover crop shown by the viewfinder, including portrait sensors.
  let width = video.videoWidth, height = video.videoHeight;
  if (width / height > 4 / 3) width = height * 4 / 3;
  else height = width * 3 / 4;
  const aspectRatioUnit = Math.max(1, Math.floor(Math.min(width / 4, height / 3, photoLimits.width / 4, photoLimits.height / 3)));
  canvas.width = aspectRatioUnit * 4; canvas.height = aspectRatioUnit * 3;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot process photos. Try Safari or Chrome.');
  context.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
  if (filter !== 'original') {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    applyFilm(pixels.data, filter);
    context.putImageData(pixels, 0, 0);
  }
  for (const quality of [.84, .74, .64, .54, .44, .34, .24, .14, .08]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not save the photo. Try again.');
    if (blob.size <= photoLimits.maxBytes) return blob;
  }
  throw new Error('This photo was too large to save. Try a simpler scene.');
}
export function cameraError(error) {
  if (error.name === 'NotAllowedError') return 'Camera access is off. Allow the camera in your browser settings, then tap Enable camera.';
  if (error.name === 'NotFoundError') return 'No camera found. Open this page on your phone.';
  if (error.name === 'NotReadableError') return 'Another app may be using the camera. Close it, then try again.';
  return error.message;
}
