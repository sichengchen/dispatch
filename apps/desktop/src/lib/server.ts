/**
 * Get the Dispatch server URL
 */
export function getServerUrl(): string {
  return (
    window.dispatchApi?.getServerUrl?.() ??
    import.meta.env.VITE_DISPATCH_SERVER_URL ??
    "http://localhost:3001"
  );
}

/**
 * Get the full URL for an API endpoint
 */
export function getApiUrl(path: string): string {
  const serverUrl = getServerUrl();
  return new URL(path, serverUrl).toString();
}
