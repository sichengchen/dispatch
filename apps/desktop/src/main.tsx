import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import App from "./App.tsx";
import { trpc } from "./lib/trpc";
import { ipcFetch } from "./lib/ipcFetch";
import "highlight.js/styles/github.css";
import "./index.css";

const queryClient = new QueryClient();
const serverUrl =
  window.dispatchApi?.getServerUrl?.() ??
  import.meta.env.VITE_DISPATCH_SERVER_URL ??
  "http://localhost:3001";
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: new URL("/trpc", serverUrl).toString(),
      fetch: ipcFetch
    })
  ]
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer?.on('main-process-message', (_event: unknown, ...args: unknown[]) => {
  console.log(args[0])
})
