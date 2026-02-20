type RateLimitScope = "generate:response" | "generate:images";

interface RateLimitOptions {
  scope: RateLimitScope;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtUnix: number;
  retryAfterSeconds: number;
}

const localWindowCounts = new Map<string, number>();

function getCurrentWindow(windowSeconds: number): number {
  return Math.floor(Date.now() / 1000 / windowSeconds);
}

function buildWindowKey(scope: string, identifier: string, windowSeconds: number): string {
  const window = getCurrentWindow(windowSeconds);
  return `rl:${scope}:${identifier}:${window}`;
}

function calcResetAt(windowSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor((now + windowSeconds) / windowSeconds) * windowSeconds;
}

async function checkLocalRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const key = buildWindowKey(options.scope, options.identifier, options.windowSeconds);
  const next = (localWindowCounts.get(key) || 0) + 1;
  localWindowCounts.set(key, next);

  const resetAtUnix = calcResetAt(options.windowSeconds);
  const remaining = Math.max(0, options.limit - next);

  return {
    allowed: next <= options.limit,
    remaining,
    resetAtUnix,
    retryAfterSeconds: Math.max(0, resetAtUnix - Math.floor(Date.now() / 1000)),
  };
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  return checkLocalRateLimit(options);
}
