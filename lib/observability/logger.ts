type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function serializeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return { message: String(error) };
    }
  }
  return { message: String(error) };
}

function emit(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const payload = JSON.stringify(entry);
  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.log(payload);
}

export function createRequestLogger(baseContext: LogContext) {
  return {
    info(event: string, context: LogContext = {}) {
      emit("info", event, { ...baseContext, ...context });
    },
    warn(event: string, context: LogContext = {}) {
      emit("warn", event, { ...baseContext, ...context });
    },
    error(event: string, error?: unknown, context: LogContext = {}) {
      emit("error", event, {
        ...baseContext,
        ...context,
        error: serializeError(error),
      });
    },
  };
}
