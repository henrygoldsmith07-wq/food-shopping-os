import { z } from 'zod';

/**
 * The deployment contract, in one place.
 *
 * Server files used to read process.env ad hoc, each with its own idea of
 * what is set — so a mistyped variable failed silently at the moment it was
 * needed, and nothing could answer "what is this deployment configured
 * for?" in one call. This module is the single registry: every variable the
 * server can consume, its shape, and the honest per-service readiness the
 * UI reports.
 *
 * Deliberately none of these are required. Forq runs as a local-only app
 * without a database or auth, and that is a supported mode, not a mis-setup
 * — so "missing" is a reportable fact, never a crash. The failure that
 * deserves a loud error is a variable that is present but garbage; that is
 * what validateEnv() and requireEnv() exist to catch.
 */

export const envSchema = z.object({
  /* Auth */
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  AUTH_APPLE_ID: z.string().min(1).optional(),
  AUTH_APPLE_SECRET: z.string().min(1).optional(),
  AUTH_MICROSOFT_ID: z.string().min(1).optional(),
  AUTH_MICROSOFT_SECRET: z.string().min(1).optional(),
  AUTH_MICROSOFT_TENANT_ID: z.string().min(1).optional(),

  /* Realtime */
  ABLY_API_KEY: z.string().min(1).optional(),

  /* Database — current names and the legacy UPSTASH_* aliases */
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_PREFIX: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  /* AI relay */
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MONTHLY_TOKEN_LIMIT: z.coerce.number().int().positive().optional(),

  /* Uploads */
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  /* Scrapers */
  JINA_API_KEY: z.string().min(1).optional(),
  JINA_READER_BASE_URL: z.string().url().optional(),
  JINA_READER_ENABLED: z.enum(['true', 'false', '1', '0']).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_BASE_URL: z.string().url().optional(),
  FIRECRAWL_WAIT_MS: z.coerce.number().int().nonnegative().optional(),

  /* Monid paid pricing rung */
  MONID_CLI_ROOT: z.string().min(1).optional(),
});

/**
 * Parse a source of environment variables against the contract. Reads at
 * call time so tests can stub process.env and the status route reflects the
 * live deployment, not the state at import.
 */
export function readEnv(source = process.env) {
  return envSchema.safeParse(source);
}

/** True when a database can be constructed: a URL and a token, either naming. */
export function redisConfigured(source = process.env) {
  const url = source.UPSTASH_REDIS_REST_URL || source.KV_REST_API_URL;
  const token = source.UPSTASH_REDIS_REST_TOKEN || source.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

/**
 * The per-service readiness report the UI shows. Shape mirrors what
 * /api/backend/status has always returned, so call sites keep their labels
 * and nothing about the honesty of the details changes — it is just no
 * longer assembled from a dozen inline process.env reads.
 */
export function envStatus(source = process.env) {
  const pair = (id, secret, label, keyName) => ({
    label,
    ready: Boolean(id && secret),
    detail: id && secret ? 'Connected' : `Add ${keyName} credentials`,
  });
  const auth = {
    secret: Boolean(source.AUTH_SECRET),
    google: pair(source.AUTH_GOOGLE_ID, source.AUTH_GOOGLE_SECRET, 'Google sign-in & Calendar', 'OAuth'),
    apple: pair(source.AUTH_APPLE_ID, source.AUTH_APPLE_SECRET, 'Apple sign-in', 'OAuth'),
    microsoft: pair(
      source.AUTH_MICROSOFT_ID, source.AUTH_MICROSOFT_SECRET,
      'Microsoft sign-in & Calendar', 'OAuth',
    ),
  };
  return {
    auth,
    ai: {
      label: 'AI relay (OpenAI)',
      ready: Boolean(source.OPENAI_API_KEY),
      detail: source.OPENAI_API_KEY ? 'Connected' : 'Add OPENAI_API_KEY',
    },
    uploads: {
      label: 'Private receipt uploads',
      ready: Boolean(source.BLOB_READ_WRITE_TOKEN),
      detail: source.BLOB_READ_WRITE_TOKEN ? 'Connected' : 'Add BLOB_READ_WRITE_TOKEN',
    },
    realtime: {
      ably: Boolean(source.ABLY_API_KEY),
      redis: redisConfigured(source),
      ready: Boolean(source.ABLY_API_KEY || redisConfigured(source)),
    },
  };
}

/**
 * Startup validation: fail loudly on variables that are present but garbage.
 * Absence is a supported local-only mode; a URL that is not a URL is always
 * a mistake. Returns a report rather than throwing so a status endpoint can
 * surface it, while a deployment script can call assertValidEnv().
 */
export function validateEnv(source = process.env) {
  const parsed = readEnv(source);
  if (parsed.success) return { ok: true, invalid: [] };
  const invalid = parsed.error.issues.map((issue) => ({
    key: issue.path.join('.'),
    message: issue.message,
  }));
  return { ok: false, invalid };
}

/** The variables a full deployment needs for sync and sign-in. */
export const REQUIRED_FOR_FULL_DEPLOYMENT = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'AUTH_SECRET'];

/**
 * Throw unless every named variable is present. For scripts and entry
 * points that genuinely cannot run without them — never for the local-only
 * mode, which is a first-class citizen rather than a mis-setup.
 */
export function requireEnv(keys = REQUIRED_FOR_FULL_DEPLOYMENT, source = process.env) {
  const missing = keys.filter((key) => !source[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/** Throw when any present variable fails its contract. */
export function assertValidEnv(source = process.env) {
  const report = validateEnv(source);
  if (!report.ok) {
    const detail = report.invalid.map((entry) => `${entry.key}: ${entry.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  return report;
}