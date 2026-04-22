const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

const LIMITS = {
  ip: 20,
  username: 10,
  combo: 5,
} as const;

type Scope = keyof typeof LIMITS;

interface AttemptBucket {
  failures: number[];
  blockedUntil: number;
}

const buckets: Record<Scope, Map<string, AttemptBucket>> = {
  ip: new Map(),
  username: new Map(),
  combo: new Map(),
};

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (!trimmed) {
    return 'unknown';
  }
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length);
  }
  return trimmed;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function getKeys(ip: string, username: string): Record<Scope, string> {
  const normalizedIp = normalizeIp(ip);
  const normalizedUsername = normalizeUsername(username);
  return {
    ip: normalizedIp,
    username: normalizedUsername,
    combo: `${normalizedIp}::${normalizedUsername}`,
  };
}

function pruneBucket(scope: Scope, key: string, now: number): AttemptBucket {
  const existing = buckets[scope].get(key) ?? { failures: [], blockedUntil: 0 };
  existing.failures = existing.failures.filter((ts) => now - ts <= WINDOW_MS);

  if (existing.blockedUntil <= now) {
    existing.blockedUntil = 0;
  }

  if (existing.failures.length === 0 && existing.blockedUntil === 0) {
    buckets[scope].delete(key);
    return { failures: [], blockedUntil: 0 };
  }

  buckets[scope].set(key, existing);
  return existing;
}

export function checkLoginRateLimit(ip: string, username: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const keys = getKeys(ip, username);
  let blockedUntil = 0;

  (Object.keys(keys) as Scope[]).forEach((scope) => {
    const bucket = pruneBucket(scope, keys[scope], now);
    if (bucket.blockedUntil > blockedUntil) {
      blockedUntil = bucket.blockedUntil;
    }
  });

  if (blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(ip: string, username: string): void {
  const now = Date.now();
  const keys = getKeys(ip, username);

  (Object.keys(keys) as Scope[]).forEach((scope) => {
    const bucket = pruneBucket(scope, keys[scope], now);
    bucket.failures.push(now);

    if (bucket.failures.length >= LIMITS[scope]) {
      bucket.blockedUntil = now + BLOCK_MS;
    }

    buckets[scope].set(keys[scope], bucket);
  });
}

export function clearLoginRateLimit(ip: string, username: string): void {
  const keys = getKeys(ip, username);

  (Object.keys(keys) as Scope[]).forEach((scope) => {
    buckets[scope].delete(keys[scope]);
  });
}
