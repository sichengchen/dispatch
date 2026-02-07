/// <reference types="vite/client" />

type DispatchApiRequest = {
  path: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
};

type DispatchApiResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

interface Window {
  ipcRenderer?: {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
    off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
    send: (channel: string, ...args: unknown[]) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
  dispatchApi?: {
    request: (payload: DispatchApiRequest) => Promise<DispatchApiResponse>;
    getServerUrl?: () => string;
    openExternal?: (url: string) => Promise<void>;
  };
}
