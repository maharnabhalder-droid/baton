import { getCookie } from "./utils";

const BACKEND_INTERNAL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions extends RequestInit {
  data?: any;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  // In the browser, always use relative path /api/* so Next.js rewrites handle the proxy
  // This solves cross-site cookie restrictions (SameSite=Strict) between Vercel and Render
  const isServer = typeof window === "undefined";
  const url = isServer ? `${BACKEND_INTERNAL}${endpoint}` : endpoint;

  const headers = new Headers(options.headers || {});

  // For state-changing requests, attach double-submit CSRF token header
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  let body = options.body;
  const isUpload = (options.data && options.data instanceof FormData) || (options.body && options.body instanceof FormData);
  if (options.data && !(options.data instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.data);
  } else if (options.data instanceof FormData) {
    body = options.data;
  }
  if (isUpload) {
    headers.delete("Content-Type");
  }

  const isAiOrHeavy = endpoint.includes("/rehearsal/") || endpoint.includes("/pipeline") || endpoint.includes("/transcribe");
  const timeoutMs = isUpload || isAiOrHeavy ? 90000 : 45000;
  const timeoutSignal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;

  let slowTimer: any = null;
  if (!isServer) {
    slowTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("baton:server-waking", { detail: { waking: true } }));
    }, 4000);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      body,
      signal: options.signal || timeoutSignal,
      credentials: "include",
    });
  } catch (fetchErr: any) {
    if (fetchErr.name === "AbortError" || fetchErr.name === "TimeoutError") {
      throw new Error("Server took longer than expected to respond (likely waking from cold start). Please click Retry or refresh the page.");
    }
    throw fetchErr;
  } finally {
    if (slowTimer) {
      clearTimeout(slowTimer);
      if (!isServer) {
        window.dispatchEvent(new CustomEvent("baton:server-waking", { detail: { waking: false } }));
      }
    }
  }

  if (response.status === 401 && endpoint !== "/api/auth/login" && endpoint !== "/api/auth/refresh" && endpoint !== "/api/auth/register" && endpoint !== "/api/auth/demo") {
    // Attempt token refresh once
    try {
      const refreshTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(10000)
        : undefined;
      const refreshResp = await fetch(isServer ? `${BACKEND_INTERNAL}/api/auth/refresh` : "/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        signal: refreshTimeout,
      });
      if (refreshResp.ok) {
        return apiRequest<T>(endpoint, options);
      }
    } catch {
      // Refresh failed
    }
  }

  if (!response.ok) {
    let errorDetail = `Request failed (${response.status})`;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // non-json
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
