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
  ipcRenderer: {
    on: (...args: any[]) => void;
    off: (...args: any[]) => void;
    send: (...args: any[]) => void;
    invoke: (...args: any[]) => Promise<any>;
  };
  dispatchApi: {
    request: (payload: DispatchApiRequest) => Promise<DispatchApiResponse>;
  };
}
