const browser = () => (typeof window === 'undefined' ? {} : window);

export const captureSupport = () => ({
  barcode: typeof browser().BarcodeDetector === 'function',
  receiptText: typeof browser().TextDetector === 'function',
  speech: typeof (browser().SpeechRecognition || browser().webkitSpeechRecognition) === 'function',
  geolocation: Boolean(browser().navigator?.geolocation),
});

const bitmapFor = (file, createBitmap) => {
  if (typeof createBitmap !== 'function') throw new Error('This browser cannot open that image for recognition.');
  return createBitmap(file);
};

export const detectBarcodeImage = async (file, {
  Detector = browser().BarcodeDetector,
  createBitmap = browser().createImageBitmap,
} = {}) => {
  if (typeof Detector !== 'function') {
    throw new Error('Camera barcode recognition is unavailable in this browser. Type the number instead.');
  }
  const formats = typeof Detector.getSupportedFormats === 'function'
    ? await Detector.getSupportedFormats()
    : [];
  const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((format) => !formats.length || formats.includes(format));
  const detector = new Detector(wanted.length ? { formats: wanted } : undefined);
  const bitmap = await bitmapFor(file, createBitmap);
  try {
    const results = await detector.detect(bitmap);
    const code = String(results?.[0]?.rawValue || '').trim();
    if (!code) throw new Error('No barcode was found in that image. Try again in brighter light or type the number.');
    return code;
  } finally {
    bitmap?.close?.();
  }
};

export const detectReceiptText = async (file, {
  Detector = browser().TextDetector,
  createBitmap = browser().createImageBitmap,
} = {}) => {
  if (typeof Detector !== 'function') {
    throw new Error('Receipt OCR is unavailable in this browser. Paste receipt text from the retailer app or email.');
  }
  const detector = new Detector();
  const bitmap = await bitmapFor(file, createBitmap);
  try {
    const results = await detector.detect(bitmap);
    const text = (results || []).map((row) => String(row.rawValue || '').trim()).filter(Boolean).join('\n');
    if (!text) throw new Error('No receipt text was found. Try a flatter, brighter photo or paste the text.');
    return text;
  } finally {
    bitmap?.close?.();
  }
};
