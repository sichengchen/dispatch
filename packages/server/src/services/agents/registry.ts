/**
 * Agent registry - manages registered agents that can be invoked via chat
 */

import type { AgentDefinition, RegisteredAgent } from "./types";

/**
 * In-memory registry of available agents
 */
const agentRegistry = new Map<string, RegisteredAgent>();

/**
 * Register an agent definition
 * @param definition The agent definition to register
 * @throws Error if an agent with the same ID is already registered
 */
export function registerAgent(definition: AgentDefinition): void {
  if (agentRegistry.has(definition.id)) {
    throw new Error(`Agent with ID "${definition.id}" is already registered`);
  }

  agentRegistry.set(definition.id, {
    definition,
    registeredAt: new Date(),
  });

  console.log(`[agent-registry] Registered agent: ${definition.id} (${definition.name})`);
}

/**
 * Get an agent by ID
 * @param id The agent ID
 * @returns The agent definition or undefined if not found
 */
export function getAgent(id: string): AgentDefinition | undefined {
  return agentRegistry.get(id)?.definition;
}

/**
 * Get all registered agents
 * @returns Array of all registered agent definitions
 */
export function listAgents(): AgentDefinition[] {
  return Array.from(agentRegistry.values()).map((entry) => entry.definition);
}

/**
 * Check if an agent is registered
 * @param id The agent ID
 * @returns True if the agent is registered
 */
export function hasAgent(id: string): boolean {
  return agentRegistry.has(id);
}

/**
 * Unregister an agent (mainly for testing)
 * @param id The agent ID to unregister
 * @returns True if the agent was unregistered
 */
export function unregisterAgent(id: string): boolean {
  const deleted = agentRegistry.delete(id);
  if (deleted) {
    console.log(`[agent-registry] Unregistered agent: ${id}`);
  }
  return deleted;
}

/**
 * Clear all registered agents (mainly for testing)
 */
export function clearAgentRegistry(): void {
  agentRegistry.clear();
  console.log("[agent-registry] Cleared all agents");
}
