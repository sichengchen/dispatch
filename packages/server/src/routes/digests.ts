import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { digests } from "@dispatch/db";
import { t } from "../trpc";
import { generateDigest } from "../services/digest";
import { TRPCError } from "@trpc/server";

export const digestsRouter = t.router({
  latest: t.procedure.query(({ ctx }) => {
    const row = ctx.db
      .select()
      .from(digests)
      .orderBy(desc(digests.generatedAt))
      .limit(1)
      .get();

    if (!row) return null;
    return {
      ...row,
      articleIds: JSON.parse(row.articleIds) as number[],
    };
  }),
  byId: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => {
      const row = ctx.db
        .select()
        .from(digests)
        .where(eq(digests.id, input.id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Digest not found" });
      }

      return {
        ...row,
        articleIds: JSON.parse(row.articleIds) as number[],
      };
    }),

  list: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(30).default(7),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      const limit = input?.limit ?? 7;
      return ctx.db
        .select()
        .from(digests)
        .orderBy(desc(digests.generatedAt))
        .limit(limit)
        .all()
        .map((row) => ({
          ...row,
          articleIds: JSON.parse(row.articleIds) as number[],
        }));
    }),

  generate: t.procedure.mutation(async () => {
    return generateDigest();
  }),
});
