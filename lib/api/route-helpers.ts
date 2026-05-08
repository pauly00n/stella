import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { createRequestLogger } from "@/lib/observability/logger";
import { checkRateLimit } from "@/lib/security/rate-limit";

type Logger = ReturnType<typeof createRequestLogger>;

export interface RouteContext {
  requestId: string;
  clientIp: string;
  logger: Logger;
}

export function buildRouteContext(request: NextRequest, route: string, method?: string): RouteContext {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
  const logger = createRequestLogger({ requestId, route, ...(method ? { method } : {}), clientIp });
  return { requestId, clientIp, logger };
}

/**
 * Parses + validates a JSON request body against a Zod schema.
 * Returns either parsed data or a 400 NextResponse for the caller to return.
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: NextResponse.json({ ok: false, error: "Invalid or empty JSON body" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 }) };
  }

  return { data: parsed.data };
}

/**
 * Enforces a per-user rate limit. Returns either `null` (allowed) or a 429 NextResponse.
 */
export async function enforceRateLimit(args: {
  scope: "generate:response" | "generate:images" | "generate:papers";
  identifier: string;
  limit: number;
  windowSeconds?: number;
  logger: Logger;
  logEvent: string;
}): Promise<NextResponse | null> {
  const result = await checkRateLimit({
    scope: args.scope,
    identifier: args.identifier,
    limit: args.limit,
    windowSeconds: args.windowSeconds ?? 60,
  });

  if (result.allowed) return null;

  args.logger.warn(args.logEvent, {
    limit: args.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });

  return NextResponse.json(
    {
      ok: false,
      error: "Rate limit exceeded. Please try again shortly.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(args.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAtUnix),
      },
    },
  );
}

export const unauthorizedResponse = () =>
  NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
