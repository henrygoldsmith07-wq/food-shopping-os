/**
 * robots.txt, honoured rather than assumed.
 *
 * A price scraper that ignores robots.txt is a scraper that gets the app's IP
 * blocked and its operator a letter. Every fetch the scraper makes goes
 * through `isScrapeAllowed` first, and a host that says no is reported as
 * "declined by robots.txt" in the UI rather than quietly skipped — the user
 * can see which shops answered and which refused.
 *
 * The parser implements the parts of the spec retailers actually use:
 * User-agent grouping (including `*`), Allow/Disallow with `*` and `$`
 * wildcards, longest-match-wins precedence, and Crawl-delay.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // robots.txt is not volatile
const FETCH_TIMEOUT_MS = 5000;
const MAX_ROBOTS_BYTES = 512 * 1024;

/** host → { rules, crawlDelay, fetchedAt, status } */
const cache = new Map();

export const clearRobotsCache = () => cache.clear();

/** Split robots.txt into per-agent groups. Later groups for the same agent merge. */
export const parseRobots = (body = '') => {
  const groups = new Map();
  let agents = [];
  let expectingAgent = false;
  for (const rawLine of String(body).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      // A run of consecutive User-agent lines shares one rule block.
      if (!expectingAgent) agents = [];
      agents.push(value.toLowerCase());
      expectingAgent = true;
      for (const agent of agents) if (!groups.has(agent)) groups.set(agent, { rules: [], crawlDelay: null });
      continue;
    }
    expectingAgent = false;
    if (!agents.length) continue;
    for (const agent of agents) {
      const group = groups.get(agent);
      if (field === 'disallow') group.rules.push({ allow: false, path: value });
      else if (field === 'allow') group.rules.push({ allow: true, path: value });
      else if (field === 'crawl-delay') {
        const delay = Number(value);
        if (Number.isFinite(delay) && delay >= 0) group.crawlDelay = Math.min(delay, 60);
      }
    }
  }
  return groups;
};

/** The most specific group for our agent, falling back to `*`. */
export const groupFor = (groups, userAgent = '') => {
  const lower = String(userAgent).toLowerCase();
  let best = null;
  for (const [agent, group] of groups) {
    if (agent === '*') continue;
    if (lower.includes(agent) && (!best || agent.length > best.agent.length)) best = { agent, group };
  }
  return best?.group || groups.get('*') || null;
};

/** robots.txt path pattern → regex, supporting `*` and an anchoring `$`. */
const patternToRegex = (pattern) => {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
};

/**
 * Longest-match-wins, Allow beating Disallow at equal length — the precedence
 * every major crawler settled on.
 */
export const pathAllowed = (group, path = '/') => {
  if (!group) return true;
  let decision = true;
  let matched = -1;
  for (const rule of group.rules) {
    // An empty Disallow means "allow everything" and matches nothing.
    if (rule.path === '') {
      if (!rule.allow && matched < 0) decision = true;
      continue;
    }
    if (!patternToRegex(rule.path).test(path)) continue;
    const length = rule.path.length;
    if (length > matched || (length === matched && rule.allow)) {
      matched = length;
      decision = rule.allow;
    }
  }
  return decision;
};

const fetchRobots = async (origin, userAgent, fetchImpl) => {
  const response = await fetchImpl(`${origin}/robots.txt`, {
    headers: { 'user-agent': userAgent, accept: 'text/plain' },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // 401 and 403 are the server saying "you may not have this", which is not
  // the same as "there is nothing here". Reading them as an absent robots.txt
  // would turn an explicit refusal into permission to crawl everything — the
  // one direction this check must never fail in.
  if (response.status === 401 || response.status === 403) {
    return { body: '', status: 'forbidden' };
  }
  // Any other 4xx means no robots.txt, which the spec reads as "everything
  // permitted".
  if (response.status >= 400 && response.status < 500) return { body: '', status: 'absent' };
  if (!response.ok) return { body: '', status: 'unreachable' };
  const body = (await response.text()).slice(0, MAX_ROBOTS_BYTES);
  return { body, status: 'present' };
};

/**
 * May we fetch this URL?
 *
 * A host we cannot reach robots.txt for is treated as disallowed. That is the
 * cautious reading, and the cost of being wrong is one shop showing "could not
 * confirm permission" rather than an unpoliced crawl.
 */
export const isScrapeAllowed = async (target, { userAgent = 'ForqBot', fetchImpl = fetch } = {}) => {
  let url;
  try {
    url = new URL(target);
  } catch {
    return { allowed: false, reason: 'invalid-url', crawlDelay: null };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { allowed: false, reason: 'unsupported-protocol', crawlDelay: null };
  }
  const key = `${url.origin}|${userAgent}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const denied = cached.status === 'unreachable' || cached.status === 'forbidden';
    return {
      allowed: denied ? false : pathAllowed(cached.group, url.pathname + url.search),
      reason: denied ? `robots-${cached.status}` : 'robots',
      crawlDelay: cached.group?.crawlDelay ?? null,
      cached: true,
    };
  }
  let result;
  try {
    result = await fetchRobots(url.origin, userAgent, fetchImpl);
  } catch {
    result = { body: '', status: 'unreachable' };
  }
  const group = result.status === 'present' ? groupFor(parseRobots(result.body), userAgent) : null;
  cache.set(key, { group, status: result.status, fetchedAt: Date.now() });
  if (result.status === 'unreachable') {
    return { allowed: false, reason: 'robots-unreachable', crawlDelay: null, cached: false };
  }
  if (result.status === 'forbidden') {
    return { allowed: false, reason: 'robots-forbidden', crawlDelay: null, cached: false };
  }
  return {
    allowed: pathAllowed(group, url.pathname + url.search),
    reason: result.status === 'absent' ? 'no-robots-file' : 'robots',
    crawlDelay: group?.crawlDelay ?? null,
    cached: false,
  };
};
