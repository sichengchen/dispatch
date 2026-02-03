import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@dispatch/api";

export const trpc = createTRPCReact<AppRouter>();
