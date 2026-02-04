import { getUiConfig } from "./settings";

export type PipelineStep = "classify" | "grade" | "summarize" | "vectorize";
export type PipelineStatus = "start" | "success" | "error" | "skip";

export type PipelineEvent = {
  articleId: number;
  step: PipelineStep;
  status: PipelineStatus;
  message?: string;
  at: string;
};

const MAX_EVENTS_PER_ARTICLE = 50;
const pipelineEvents = new Map<number, PipelineEvent[]>();

function isVerboseEnabled() {
  return getUiConfig().verbose === true;
}

export function clearPipelineEvents(articleId: number) {
  if (!isVerboseEnabled()) return;
  pipelineEvents.delete(articleId);
}

export function recordPipelineEvent(
  articleId: number,
  step: PipelineStep,
  status: PipelineStatus,
  message?: string
) {
  if (!isVerboseEnabled()) return;
  const events = pipelineEvents.get(articleId) ?? [];
  events.push({
    articleId,
    step,
    status,
    message,
    at: new Date().toISOString()
  });
  if (events.length > MAX_EVENTS_PER_ARTICLE) {
    events.splice(0, events.length - MAX_EVENTS_PER_ARTICLE);
  }
  pipelineEvents.set(articleId, events);
}

export function getPipelineEvents(articleId: number): PipelineEvent[] {
  return pipelineEvents.get(articleId) ?? [];
}
