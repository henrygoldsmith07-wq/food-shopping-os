/**
 * Progress photos, kept small enough for the local-first store.
 *
 * They start in localStorage and are included in household state only after
 * the user opts into sync. Full-size pictures would exhaust browser storage,
 * so every image is downsampled to a thumbnail and the number is capped.
 *
 * The sizing maths is pure and tested; the drawing needs a canvas, so it is
 * kept separate and simply reports that it can't run where there isn't one.
 */

export const MAX_EDGE = 480;
export const QUALITY = 0.72;

/** Fit an image inside a square bound, keeping its shape. */
export const fitDimensions = (width, height, max = MAX_EDGE) => {
  if (!width || !height) return { width: 0, height: 0 };
  if (width <= max && height <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/** Roughly how much of a browser's 5 MB store a set of thumbnails takes. */
export const storageEstimate = (photos = []) => {
  const bytes = photos.reduce((sum, p) => sum + Math.ceil(((p.thumb || '').length * 3) / 4), 0);
  return {
    bytes,
    kb: Math.round(bytes / 1024),
    pctOfFiveMb: Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100)),
  };
};

/**
 * Read a chosen file into a small JPEG data URL. Resolves to null where there
 * is no canvas to draw on, so the caller can say so rather than hang.
 */
export const shrinkImage = (file, max = MAX_EDGE) =>
  new Promise((resolve) => {
    if (!file || typeof FileReader === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const { width, height } = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', QUALITY));
        } catch {
          resolve(null);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
