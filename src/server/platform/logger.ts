import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Claves que nunca se escriben en los logs, en cualquier nivel de anidamiento. */
const REDACTED_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|totp|otp|recovery|tax_?id|signature/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACTED_KEYS.test(k) ? "[redactado]" : redact(v, depth + 1);
  return out;
}

function minLevel(): Level {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in order) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function write(level: Level, message: string, context: Record<string, unknown> = {}) {
  if (order[level] < order[minLevel()]) return;
  // Una línea JSON por evento: Vercel y cualquier colector de logs la indexan sin parsers extra.
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...(redact(context) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
