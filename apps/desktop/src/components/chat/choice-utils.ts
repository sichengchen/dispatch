export interface ChoiceOption {
  label: string;
  value: string;
}

export interface ChoiceData {
  question: string;
  options: ChoiceOption[];
}

export interface CompletionData {
  message: string;
}

/**
 * Parse a choices JSON block and validate its structure
 */
export function parseChoicesBlock(content: string): ChoiceData | null {
  try {
    const parsed = JSON.parse(content);

    // Validate required fields
    if (typeof parsed.question !== "string" || !parsed.question) {
      return null;
    }
    if (!Array.isArray(parsed.options) || parsed.options.length < 2) {
      return null;
    }

    // Validate each option
    for (const opt of parsed.options) {
      if (typeof opt.label !== "string" || !opt.label) return null;
      if (typeof opt.value !== "string" || !opt.value) return null;
    }

    return {
      question: parsed.question,
      options: parsed.options,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a completion JSON block and validate its structure
 */
export function parseCompletionBlock(content: string): CompletionData | null {
  try {
    const parsed = JSON.parse(content);

    // Validate required fields
    if (typeof parsed.message !== "string" || !parsed.message) {
      return null;
    }

    return {
      message: parsed.message,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a message content contains a completion block
 */
export function hasCompletionBlock(content: string): boolean {
  return /```completion\s*\n[\s\S]*?\n```/.test(content);
}
