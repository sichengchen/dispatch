export type IpcResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

export async function ipcFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
  const headers =
    init?.headers ? Object.fromEntries(new Headers(init.headers)) : undefined;

  if (!window.dispatchApi?.request) {
    return fetch(url, init);
  }

  const result = await window.dispatchApi.request({
    path,
    init: {
      method: init?.method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined
    }
  });

  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers
  });
}
