/**
 * Iterates JSON-encoded data lines from a `text/event-stream` response body.
 * Skips blank lines and `[DONE]` sentinels; silently drops malformed payloads.
 */
export async function* readSseEvents<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          yield JSON.parse(jsonStr) as T;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
