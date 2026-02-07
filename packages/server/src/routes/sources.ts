import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { sources } from "@dispatch/db";
import { t } from "../trpc";
import { scrapeSource, validateUrl } from "../services/scraper";
import {
  generateSkill,
  regenerateSkill,
  getSkillPath,
  skillExists,
} from "../services/skill-generator";
import { startTaskRun, finishTaskRun } from "../services/task-log";

export const sourcesRouter = t.router({
  list: t.procedure.query(({ ctx }) => {
    return ctx.db.select().from(sources).all();
  }),
  listForWeights: t.procedure.query(({ ctx }) => {
    return ctx.db
      .select({
        id: sources.id,
        name: sources.name,
        url: sources.url,
      })
      .from(sources)
      .all();
  }),
  add: t.procedure
    .input(
      z.object({
        url: z.string().url(),
        name: z.string().min(1),
        type: z.enum(["rss", "web"]).default("rss"),
        generateSkill: z.boolean().optional().default(true)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const validation = validateUrl(input.url);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.error ?? "Invalid source URL"
        });
      }

      const insertResult = ctx.db
        .insert(sources)
        .values({
          url: input.url,
          name: input.name,
          type: input.type
        })
        .run();

      const id = Number(insertResult.lastInsertRowid);
      const row = ctx.db
        .select()
        .from(sources)
        .where(eq(sources.id, id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      // Auto-generate skill for web sources
      let skillGenerationResult: { success: boolean; error?: string } | undefined;
      if (input.type === "web" && input.generateSkill) {
        console.log(`[sources.add] Generating skill for web source ${id}: ${input.name}`);
        try {
          const result = await generateSkill(id, input.url, input.name);
          skillGenerationResult = {
            success: result.success,
            error: result.error,
          };
        } catch (err) {
          console.error(`[sources.add] Skill generation failed for source ${id}:`, err);
          skillGenerationResult = {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return {
        ...row,
        skillGenerationResult,
      };
    }),
  delete: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const result = ctx.db
        .delete(sources)
        .where(eq(sources.id, input.id))
        .run();

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }

      return { ok: true };
    }),
  deleteMany: t.procedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1)
      })
    )
    .mutation(({ ctx, input }) => {
      const uniqueIds = Array.from(new Set(input.ids));
      const result = ctx.db
        .delete(sources)
        .where(inArray(sources.id, uniqueIds))
        .run();

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sources not found" });
      }

      return { ok: true, deleted: result.changes };
    }),
  refresh: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await scrapeSource(input.id);
      return { ok: true, ...result };
    }),
  retry: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(sources)
        .set({
          consecutiveFailures: 0,
          healthStatus: "healthy",
          isActive: true,
          lastErrorAt: null,
        })
        .where(eq(sources.id, input.id))
        .run();
      const result = await scrapeSource(input.id);
      return { ok: true, ...result };
    }),
  // Skill management routes
  generateSkill: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const source = ctx.db
        .select()
        .from(sources)
        .where(eq(sources.id, input.id))
        .get();

      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }

      const result = await generateSkill(source.id, source.url, source.name);
      
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to generate skill",
        });
      }

      return {
        ok: true,
        skillPath: result.skillPath,
        validationResult: result.validationResult,
      };
    }),
  regenerateSkill: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const source = ctx.db
        .select()
        .from(sources)
        .where(eq(sources.id, input.id))
        .get();

      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }

      const runId = startTaskRun("skill", `Regenerate Skill: ${source.name}`, {
        sourceId: source.id,
        sourceName: source.name
      });

      try {
        const result = await regenerateSkill(source.id);

        if (!result.success) {
          finishTaskRun(runId, "error", {
            error: result.error ?? "Failed to regenerate skill"
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error ?? "Failed to regenerate skill",
          });
        }

        finishTaskRun(runId, "success", {
          skillPath: result.skillPath
        });

        return {
          ok: true,
          skillPath: result.skillPath,
          validationResult: result.validationResult,
        };
      } catch (err) {
        finishTaskRun(runId, "error", {
          error: err instanceof Error ? err.message : String(err)
        });
        throw err;
      }
    }),
  openSkillFile: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => {
      const skillPath = getSkillPath(input.id);
      const exists = skillExists(input.id);

      return {
        skillPath,
        exists,
      };
    }),
});
