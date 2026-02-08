import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./context.js";

export const t = initTRPC.context<TrpcContext>().create();
