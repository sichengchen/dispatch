import type { DbClient } from "@dispatch/db";
import { db } from "@dispatch/db";

type CreateContextOptions = {
  req: Request;
};

export type TrpcContext = {
  db: DbClient;
  req: Request;
};

export function createContext({ req }: CreateContextOptions): TrpcContext {
  return { db, req };
}
