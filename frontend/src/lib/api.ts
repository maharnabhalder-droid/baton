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
  if (options.data && !(options.data instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.data);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 401 && endpoint !== "/api/auth/login" && endpoint !== "/api/auth/refresh" && endpoint !== "/api/auth/register" && endpoint !== "/api/auth/demo") {
    // Attempt token refresh once
    try {
      const refreshResp = await fetch(isServer ? `${BACKEND_INTERNAL}/api/auth/refresh` : "/api/auth/refresh", {
        method: "POST",
        credentials: "include",
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
