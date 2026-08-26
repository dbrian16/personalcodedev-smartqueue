/**
 * Minimal JSON HTTP helpers over the native `fetch`.
 *
 * Every call in this repo is a plain JSON request with an optional bearer token
 * and timeout, so there is nothing here for interceptors, retry or cancellation.
 * Errors carry a `response` field so `apiErrorMessage` can read the server's
 * reason off them.
 */

export interface ApiResponse<T = any> {
  data: T;
  status: number;
}

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  /** Aborts the request after this many milliseconds. */
  timeout?: number;
}

const request = async <T = any>(
  method: string,
  url: string,
  body: unknown,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> => {
  const { headers, timeout } = options;
  const hasBody = body !== undefined;

  const response = await fetch(url, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal: timeout ? AbortSignal.timeout(timeout) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    // `response` is attached so call sites can read `error.response.status` and
    // `apiErrorMessage` can find the server's reason.
    const error = new Error(`Request to ${url} failed with status ${response.status}`) as Error & {
      response: { status: number; data: T };
    };
    error.response = { status: response.status, data: data as T };
    throw error;
  }

  return { data: data as T, status: response.status };
};

export const apiGet = <T = any>(url: string, options?: ApiRequestOptions) =>
  request<T>('GET', url, undefined, options);
export const apiPost = <T = any>(url: string, body?: unknown, options?: ApiRequestOptions) =>
  request<T>('POST', url, body, options);
export const apiPut = <T = any>(url: string, body?: unknown, options?: ApiRequestOptions) =>
  request<T>('PUT', url, body, options);
export const apiPatch = <T = any>(url: string, body?: unknown, options?: ApiRequestOptions) =>
  request<T>('PATCH', url, body, options);
export const apiDelete = <T = any>(url: string, options?: ApiRequestOptions) =>
  request<T>('DELETE', url, undefined, options);
