import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./context";

export const t = initTRPC.context<TrpcContext>().create();
