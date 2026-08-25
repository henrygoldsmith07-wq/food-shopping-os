/**
 * The browser half of recipe import.
 *
 * A link cannot be fetched from here — cross-origin rules stop it — so the
 * link goes to the app's own route, which fetches the page and hands back
 * either the page's own recipe data or a draft a model laid out from what the
 * page said. A photo is read on the device first with the browser's text
 * recogniser where there is one, and only sent as an image where there isn't.
 *
 * Whichever way a recipe arrives, it ends up as the same plain text the paste
 * box takes, and goes through the same parser. One pipeline, three doors.
 */

import { detectImageText, captureSupport } from './smart-capture.js';

export const IMPORT_ROUTE = '/api/recipes/import';

/** Which platform a link is from, for the attribution line. */
export const PLATFORM_LABELS = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  photo: 'Photo',
  web: 'the web',
};

const VIDEO_PLATFORMS = ['tiktok', 'youtube', 'instagram'];

export const isSupportedImportLink = (value) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(String(value || '').trim());

const message = async (response) => {
  try {
    const body = await response.json();
    return body?.error || 'The import could not be completed.';
  } catch {
    return 'The import could not be completed.';
  }
};

const post = async (payload, fetchImpl) => {
  const response = await fetchImpl(IMPORT_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await message(response));
  return response.json();
};

/** Ask the backend to read a link. Returns { draft, text, source }. */
export const importFromLink = async (url, { fetchImpl = fetch } = {}) => {
  const clean = String(url || '').trim();
  if (!isSupportedImportLink(clean)) throw new Error('That doesn’t look like a recipe link.');
  return post({ url: clean }, fetchImpl);
};

/**
 * Read a recipe photo.
 *
 * The device's own text recogniser goes first: it never leaves the phone, and
 * a book page or a screenshot is exactly what it is good at. Only when the
 * browser has no recogniser — or it found nothing — does the picture itself go
 * to a vision model, and the caller is told which happened.
 */
export const importFromPhoto = async (file, {
  fetchImpl = fetch, readText = detectImageText, toDataUrl = fileToDataUrl, support = captureSupport,
} = {}) => {
  if (!file) throw new Error('Choose a photo of the recipe first.');
  if (support().imageText) {
    try {
      const text = await readText(file);
      if (text && text.trim().length >= 20) return post({ text }, fetchImpl);
    } catch {
      // The recogniser is there but could not read this picture. Fall through
      // to the vision model rather than making the user retake the photo.
    }
  }
  const image = await toDataUrl(file);
  if (!image) throw new Error('That photo could not be read on this device.');
  return post({ image }, fetchImpl);
};

/** A chosen file as a data URL, for the vision path. */
export const fileToDataUrl = (file) => new Promise((resolve) => {
  if (!file || typeof FileReader === 'undefined') {
    resolve(null);
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => resolve(null);
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
  reader.readAsDataURL(file);
});

/**
 * How a recipe is credited, in the form the recipe carries with it forever.
 *
 * `read` is the part that matters and the part apps usually drop: a recipe
 * lifted from a video caption is a different thing from one published as
 * structured data, and the user should be able to see which they have.
 */
export const sourceAttribution = (source = {}) => {
  const platform = source.platform || 'web';
  const label = source.platformLabel || PLATFORM_LABELS[platform] || platform;
  const how = {
    'schema.org': 'from the page’s own recipe data',
    caption: 'from the video caption',
    'page-metadata': 'from the page description',
    ocr: 'read off your photo on this device',
    vision: 'read from your photo by a vision model',
    typed: 'typed in',
  }[source.read] || 'imported';
  return {
    platform,
    label,
    via: source.via || 'link',
    read: source.read || null,
    url: source.url || null,
    author: source.author || null,
    datePublished: source.datePublished || null,
    model: source.model || null,
    isVideo: VIDEO_PLATFORMS.includes(platform),
    /** One line, safe to show anywhere the recipe is. */
    line: [
      source.url ? `From ${label}` : `From a ${label.toLowerCase()}`,
      source.author ? `by ${source.author}` : '',
      `· ${how}`,
    ].filter(Boolean).join(' '),
    /** How much of the recipe was actually read, rather than reconstructed. */
    exact: source.read === 'schema.org',
  };
};

/**
 * The provenance block stored on a saved recipe. Kept to the same shape the
 * paste importer already writes, with the source facts added.
 */
export const provenanceFrom = (source = {}) => {
  const attribution = sourceAttribution(source);
  return {
    author: attribution.author,
    datePublished: attribution.datePublished,
    yield: null,
    platform: attribution.platform,
    via: attribution.via,
    read: attribution.read,
    model: attribution.model,
    attribution: attribution.line,
  };
};
