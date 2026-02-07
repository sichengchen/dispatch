/**
 * Agent framework types
 */

import type { Tool } from "ai";

/** Type for tools created with the AI SDK tool() function - uses any for generics */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiTool = Tool<any, any>;

/**
 * Message in an agent conversation
 */
export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Tool execution status for UI feedback
 */
export interface ToolExecutionStatus {
  toolName: string;
  status: "running" | "completed" | "error";
  result?: unknown;
  error?: string;
}

/**
 * Definition of an agent that can be registered and invoked
 */
export interface AgentDefinition {
  /** Unique identifier for the agent */
  id: string;
  /** Display name */
  name: string;
  /** Description of what the agent does */
  description: string;
  /** System prompt that defines the agent's personality and capabilities */
  systemPrompt: string;
  /** Tools available to the agent - created with AI SDK tool() function */
  tools: Record<string, AiTool>;
  /** Optional initial greeting message */
  initialMessage?: string;
  /** Maximum number of turns before forcing completion (default: 20) */
  maxTurns?: number;
}

/**
 * Options for creating a chat session
 */
export interface ChatSessionOptions {
  /** Agent ID to use */
  agentId: string;
  /** Optional callback for tool execution status */
  onToolStatus?: (status: ToolExecutionStatus) => void;
}

/**
 * Result from an agent chat turn
 */
export interface ChatTurnResult {
  /** The assistant's response message */
  message: AgentMessage;
  /** Whether the conversation is complete */
  isComplete: boolean;
  /** Tool executions that occurred during this turn */
  toolExecutions: ToolExecutionStatus[];
  /** Number of turns used so far */
  turnCount: number;
  /** Whether the turn limit was reached */
  turnLimitReached: boolean;
}

/**
 * Agent registry entry with metadata
 */
export interface RegisteredAgent {
  definition: AgentDefinition;
  registeredAt: Date;
}
