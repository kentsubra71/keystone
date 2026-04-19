type LogPayload = {
  level: "error" | "info";
  code: string;
  message: string;
  ctx?: Record<string, unknown>;
  ts: string;
};

function emit(level: "error" | "info", code: string, message: string, ctx?: Record<string, unknown>) {
  const payload: LogPayload = {
    level,
    code,
    message,
    ctx,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logError(code: string, err: unknown, ctx?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  emit("error", code, message, ctx);
}

export function logInfo(code: string, ctx?: Record<string, unknown>): void {
  emit("info", code, "", ctx);
}
