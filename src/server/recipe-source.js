/**
 * Reading a recipe link, before any model is involved.
 *
 * The browser cannot fetch another site — cross-origin rules see to that —
 * so the fetch happens here, and only here. What this module does is gather
 * the page's own words: its structured recipe data if it publishes any, its
 * Open Graph and meta tags, and for the video platforms the caption that comes
 * back from their public oEmbed endpoint.
 *
 * Nothing here invents anything. If a page says nothing useful, the material
 * comes back thin and the caller says so rather than filling the gap.
 */

/** How long to wait on someone else's server before giving up. */
export const FETCH_TIMEOUT_MS = 8000;
/** Pages past this are not recipes, they are payloads. */
export const MAX_PAGE_BYTES = 1024 * 1024;

const PLATFORMS = [
  { id: 'tiktok', hosts: ['tiktok.com', 'vm.tiktok.com'], label: 'TikTok' },
  { id: 'youtube', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'], label: 'YouTube' },
  { id: 'instagram', hosts: ['instagram.com', 'instagr.am'], label: 'Instagram' },
];

const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Which platform a link belongs to, or `web` for an ordinary recipe page. */
export const sourcePlatform = (url) => {
  const host = hostOf(url);
  if (!host) return null;
  const match = PLATFORMS.find((platform) =>
    platform.hosts.some((known) => host === known || host.endsWith(`.${known}`)));
  return match || { id: 'web', hosts: [], label: host };
};

/* Private and link-local space, plus the loopback and metadata addresses that
   a server-side fetcher must never be talked into visiting. */
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
const BLOCKED_IPV4 = [
  /^127\./, /^10\./, /^0\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * Is this a link we are willing to fetch?
 *
 * A URL arrives from the browser, so it is an instruction from outside. Only
 * ordinary http(s) links to public hosts are followed — anything pointing at
 * the machine this runs on, the private network around it, or a cloud metadata
 * endpoint is refused, whatever the user typed.
 */
export const isFetchableRecipeUrl = (value) => {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || !host.includes('.') || BLOCKED_HOST.test(host)) return false;
  if (host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && BLOCKED_IPV4.some((range) => range.test(host))) return false;
  return true;
};

/**
 * The public oEmbed endpoint for a link, or null where there isn't one we can
 * use. Instagram's needs an app token; without one configured this returns
 * null rather than pretending a caption is on its way.
 */
export const oEmbedEndpoint = (url, env = process.env) => {
  const platform = sourcePlatform(url);
  const encoded = encodeURIComponent(String(url));
  if (platform?.id === 'tiktok') return `https://www.tiktok.com/oembed?url=${encoded}`;
  if (platform?.id === 'youtube') return `https://www.youtube.com/oembed?format=json&url=${encoded}`;
  if (platform?.id === 'instagram' && env.INSTAGRAM_OEMBED_TOKEN) {
    return `https://graph.facebook.com/v20.0/instagram_oembed?url=${encoded}&access_token=${encodeURIComponent(env.INSTAGRAM_OEMBED_TOKEN)}`;
  }
  return null;
};

const decodeEntities = (value) => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/(?:&#39;|&apos;)/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => {
    const point = Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  })
  .replace(/\s+/g, ' ')
  .trim();

const metaContent = (html, patterns) => {
  for (const pattern of patterns) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${pattern}["'][^>]*>`, 'i').exec(html);
    if (!tag) continue;
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag[0]);
    if (content?.[1]) return decodeEntities(content[1]).slice(0, 2000);
  }
  return '';
};

/** The page's own description of itself: title, blurb, author, video caption. */
export const readPageMetadata = (html = '') => {
  const source = String(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source);
  return {
    title: metaContent(source, ['og:title', 'twitter:title']) || decodeEntities(titleTag?.[1] || '').slice(0, 200),
    description: metaContent(source, ['og:description', 'twitter:description', 'description']),
    author: metaContent(source, ['author', 'article:author']),
    published: metaContent(source, ['article:published_time', 'og:video:release_date']),
    siteName: metaContent(source, ['og:site_name']),
    image: metaContent(source, ['og:image', 'twitter:image']),
  };
};

/** A caption and author out of an oEmbed payload, whichever platform it is. */
export const readOEmbed = (payload = {}) => ({
  title: decodeEntities(payload.title || '').slice(0, 300),
  author: decodeEntities(payload.author_name || '').slice(0, 120),
  // TikTok and Instagram put the caption in the title; YouTube keeps it short.
  caption: decodeEntities(payload.title || '').slice(0, 2000),
});

/**
 * Everything gathered about a link, laid out as the block of text a model is
 * asked to read. Empty fields are left out rather than sent as blanks, so a
 * thin page reads as thin instead of as a form full of nothing.
 */
export const sourceMaterial = ({ url = '', metadata = {}, oembed = null, pageText = '' } = {}) => {
  const platform = sourcePlatform(url);
  const lines = [
    `Source: ${url}`,
    platform ? `Platform: ${platform.label}` : '',
    metadata.title ? `Page title: ${metadata.title}` : '',
    metadata.siteName ? `Site: ${metadata.siteName}` : '',
    (oembed?.author || metadata.author) ? `Author: ${oembed?.author || metadata.author}` : '',
    oembed?.caption ? `Video caption: ${oembed.caption}` : '',
    metadata.description ? `Description: ${metadata.description}` : '',
    pageText ? `Page text:\n${pageText}` : '',
  ].filter(Boolean);
  return lines.join('\n');
};

/**
 * Is there enough here to be worth asking a model about?
 *
 * A page that gave us a title and nothing else cannot produce a recipe, and a
 * model asked to work from that will produce a plausible one anyway. That is
 * exactly what this app must not do.
 */
export const MIN_MATERIAL_CHARS = 120;
export const materialIsUsable = (material) => String(material || '').length >= MIN_MATERIAL_CHARS;

const withTimeout = async (fetchImpl, url, init = {}, timeout = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
};

/** Read at most `MAX_PAGE_BYTES` of a response body as text. */
const readCapped = async (response, cap = MAX_PAGE_BYTES) => {
  const body = await response.text();
  return body.length > cap ? body.slice(0, cap) : body;
};

/**
 * Fetch a link and bring back its page source and, where the platform offers
 * one, its oEmbed caption. Failures are reported, never thrown at the caller:
 * a caption that did not load is a missing caption, not a failed import.
 */
export const fetchSource = async (url, { fetchImpl = fetch, env = process.env } = {}) => {
  const errors = [];
  let html = '';
  try {
    const response = await withTimeout(fetchImpl, url, {
      headers: {
        // Some recipe sites serve a stub to unknown agents; say who we are.
        'user-agent': 'Mozilla/5.0 (compatible; ForqRecipeImport/1.0; +https://forq.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (response.ok) html = await readCapped(response);
    else errors.push(`page ${response.status}`);
  } catch (error) {
    errors.push(error?.name === 'AbortError' ? 'page timed out' : 'page could not be reached');
  }

  let oembed = null;
  const endpoint = oEmbedEndpoint(url, env);
  if (endpoint) {
    try {
      const response = await withTimeout(fetchImpl, endpoint, { headers: { accept: 'application/json' } });
      if (response.ok) oembed = readOEmbed(await response.json());
      else errors.push(`caption ${response.status}`);
    } catch {
      errors.push('caption could not be reached');
    }
  }

  return { html, oembed, errors };
};
