export type ApiErrorBody = { code: string; message: string };

export type ApiResult<T> = {
  ok: true;
  data: T;
};

/**
 * Client-side fetch helper. Calls same-origin APIs, sends cookies, and parses
 * the uniform { data } / { error: { code, message } } envelope. Throws an
 * ApiError with code+message on any failure.
 */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, signal, headers } = options;
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = (payload as { error?: ApiErrorBody })?.error;
    throw new ApiError(err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status}).`, res.status);
  }

  const data = (payload as ApiResult<T>)?.data;
  if (data === undefined) {
    throw new ApiError("UNKNOWN", "Malformed response from server.", res.status);
  }
  return data as T;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;