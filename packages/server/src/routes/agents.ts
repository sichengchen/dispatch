import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { streamText, stepCountIs } from "ai";
import type { Hono } from "hono";
import { stream } from "hono/streaming";
import { t } from "../trpc";
import { getAgent, listAgents } from "../services/agents/registry";
import { getModelConfig, createProviderMap } from "@dispatch/lib";
import { getModelsConfig, getProviders, getAgentConfig } from "../services/settings";
import type { AgentMessage } from "../services/agents/types";

const MAX_TURNS = 20;

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

/**
 * tRPC routes for agent metadata (non-streaming)
 */
export const agentsRouter = t.router({
  /** List all registered agents */
  list: t.procedure.query(() => {
    const agents = listAgents();
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      initialMessage: agent.initialMessage,
    }));
  }),

  /** Get a specific agent by ID */
  get: t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const agent = getAgent(input.id);
      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Agent "${input.id}" not found`,
        });
      }
      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        initialMessage: agent.initialMessage,
        maxTurns: agent.maxTurns ?? MAX_TURNS,
      };
    }),
});

/**
 * Register streaming chat endpoint on Hono app
 * This is separate from tRPC because tRPC doesn't support streaming well
 */
export function registerAgentChatEndpoint(app: Hono): void {
  app.post("/api/agents/chat", async (c) => {
    const body = await c.req.json();

    // Validate input
    const inputSchema = z.object({
      agentId: z.string(),
      messages: z.array(messageSchema),
    });

    const parseResult = inputSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json({ error: "Invalid request body", details: parseResult.error }, 400);
    }

    const { agentId, messages } = parseResult.data;

    // Get agent definition
    const agent = getAgent(agentId);
    if (!agent) {
      return c.json({ error: `Agent "${agentId}" not found` }, 404);
    }

    // Check turn limit
    const turnCount = messages.filter((m) => m.role === "assistant").length;
    const maxTurns = agent.maxTurns ?? MAX_TURNS;
    if (turnCount >= maxTurns) {
      return c.json({
        error: "Turn limit reached",
        turnCount,
        maxTurns,
      }, 400);
    }

    // Get model and agent configuration
    const config = getModelsConfig();
    const providers = getProviders();
    const agentConfig = getAgentConfig();
    const modelConfig = getModelConfig(config, "skill", providers);

    // Find provider credentials
    const catalogEntry = config.catalog?.find((e) => e.id === modelConfig.modelId);
    const provider = catalogEntry?.providerId
      ? providers.find((p) => p.id === catalogEntry.providerId)
      : undefined;

    if (!provider) {
      return c.json({ error: `No provider found for model ${modelConfig.modelId}` }, 500);
    }

    const providerMap = createProviderMap({
      anthropic: provider.type === "anthropic" ? provider.credentials.apiKey : undefined,
      openai: provider.type === "openai-compatible"
        ? {
            apiKey: provider.credentials.apiKey,
            baseUrl: provider.credentials.baseUrl ?? "",
          }
        : undefined,
    });

    const providerFn = providerMap[modelConfig.providerType as keyof typeof providerMap];
    if (!providerFn) {
      return c.json({ error: `Unsupported provider: ${modelConfig.providerType}` }, 500);
    }

    const model = providerFn(modelConfig.model);

    // Convert messages to AI SDK format
    const aiMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Stream the response
    return stream(c, async (streamWriter) => {
      try {
        const result = streamText({
          model,
          system: agent.systemPrompt,
          messages: aiMessages,
          tools: agent.tools,
          stopWhen: stepCountIs(agentConfig.chatAgentMaxSteps ?? 10),
          temperature: 0.2,
        });

        // Stream all events including tool calls
        for await (const event of result.fullStream) {
          if (event.type === "text-delta") {
            await streamWriter.write(event.text);
          } else if (event.type === "tool-call") {
            // Show tool execution status
            const toolName = event.toolName.replace(/_/g, " ");
            await streamWriter.write(`\n\n🔧 *${toolName}...*\n\n`);
          }
          // tool-result events are handled internally by the SDK
        }
      } catch (error) {
        console.error("[agents.chat] Streaming error:", error);
        await streamWriter.write(
          `\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    });
  });
}
