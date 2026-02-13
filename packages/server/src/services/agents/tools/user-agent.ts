import { getAgentConfig } from "../../settings.js";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function getUserAgent(): string {
  const configured = process.env.DISPATCH_USER_AGENT?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  const agentConfig = getAgentConfig();
  const settingsValue = agentConfig.userAgent?.trim();
  if (settingsValue) {
    return settingsValue;
  }
  return DEFAULT_USER_AGENT;
}
