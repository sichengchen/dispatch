/**
 * Chat tools - Tools for interactive chat conversations with users
 *
 * These tools enable agents to present choices and signal completion.
 */

import { z } from "zod";
import { tool, zodSchema } from "ai";

// ---------------------------------------------------------------------------
// present_choices - Display structured options to users
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  label: z.string().min(1).describe("Button text shown to user"),
  value: z.string().min(1).describe("Value sent back when selected"),
});

export const presentChoicesSchema = z.object({
  question: z.string().min(1).describe("The question to display to the user"),
  options: z
    .array(optionSchema)
    .min(2)
    .max(4)
    .describe("Array of 2-4 options for the user to choose from"),
  context: z
    .string()
    .optional()
    .describe("Optional context to display before the choices"),
});

/**
 * Generate formatted choice block for the agent to output
 */
function formatChoiceBlock(
  question: string,
  options: Array<{ label: string; value: string }>,
  context?: string
): string {
  const choicesJson = JSON.stringify({ question, options });

  const contextBlock = context ? `${context}\n\n` : "";

  return `Present this choice to the user using the exact format below:

${contextBlock}\`\`\`choices
${choicesJson}
\`\`\`

Wait for the user to select an option before proceeding. The user's response will be the value of the option they selected.`;
}

export function createPresentChoicesTool() {
  return tool({
    description:
      "Present a multiple-choice question to the user with clickable buttons. Use this when you need the user to choose between 2-4 options. The user will click a button to respond.",
    inputSchema: zodSchema(presentChoicesSchema),
    execute: async ({ question, options, context }) => {
      console.log(`[chat-tools] present_choices: "${question}" with ${options.length} options`);

      // Validation is handled by zod schema, but provide clear error messages
      if (options.length < 2) {
        return {
          success: false,
          error: "At least 2 options are required",
        };
      }
      if (options.length > 4) {
        return {
          success: false,
          error: "Maximum of 4 options allowed",
        };
      }

      return {
        success: true,
        instruction: formatChoiceBlock(question, options, context),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// finish_conversation - Signal that a conversation task is complete
// ---------------------------------------------------------------------------

export const finishConversationSchema = z.object({
  message: z.string().min(1).describe("Final success message to display to the user"),
});

export function createFinishConversationTool() {
  return tool({
    description:
      "Signal that the conversation task is complete. Use this after successfully adding a source. The UI will show a Done button instead of the message input.",
    inputSchema: zodSchema(finishConversationSchema),
    execute: async ({ message }) => {
      console.log(`[chat-tools] finish_conversation: "${message}"`);

      return {
        success: true,
        instruction: `Output the following completion message exactly as shown:

\`\`\`completion
${JSON.stringify({ message })}
\`\`\`

This will signal to the UI that the task is complete.`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Tool set factory
// ---------------------------------------------------------------------------

/**
 * Create chat tools for interactive agent conversations
 */
export function createChatToolSet() {
  return {
    present_choices: createPresentChoicesTool(),
    finish_conversation: createFinishConversationTool(),
  };
}
