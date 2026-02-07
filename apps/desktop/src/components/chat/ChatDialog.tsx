import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "../ui/scroll-area";
import { getApiUrl } from "../../lib/server";
import { hasCompletionBlock } from "./choice-utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  agentId: string;
  initialMessage?: string;
  apiEndpoint?: string;
  onComplete?: () => void;
}

export function ChatDialog({
  open,
  onOpenChange,
  title,
  agentId,
  initialMessage,
  apiEndpoint = "/api/agents/chat",
  onComplete,
}: ChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasCalledComplete = useRef(false);

  // Check if conversation is complete (any message contains a completion block)
  const isComplete = useMemo(
    () => messages.some((m) => m.role === "assistant" && hasCompletionBlock(m.content)),
    [messages]
  );

  // Call onComplete when conversation completes
  useEffect(() => {
    if (isComplete && onComplete && !hasCalledComplete.current) {
      hasCalledComplete.current = true;
      onComplete();
    }
  }, [isComplete, onComplete]);

  // Initialize with initial message when dialog opens
  useEffect(() => {
    if (open && initialMessage && messages.length === 0) {
      setMessages([
        {
          id: "initial",
          role: "assistant",
          content: initialMessage,
        },
      ]);
    }
  }, [open, initialMessage, messages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStreamingContent("");

      // Prepare messages for API (exclude initial greeting from history)
      const apiMessages = [...messages, userMessage]
        .filter((m) => m.id !== "initial")
        .map((m) => ({ role: m.role, content: m.content }));

      // Create abort controller
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(getApiUrl(apiEndpoint), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            messages: apiMessages,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          // Handle non-JSON error responses gracefully
          const text = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          if (text) {
            try {
              const error = JSON.parse(text);
              errorMessage = error.error || errorMessage;
            } catch {
              errorMessage = text;
            }
          }
          throw new Error(errorMessage);
        }

        // Read streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setStreamingContent(accumulated);
        }

        // Add final assistant message
        if (accumulated) {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: accumulated,
            },
          ]);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // User closed dialog, ignore
          return;
        }
        console.error("[ChatDialog] Error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ]);
      } finally {
        setIsLoading(false);
        setStreamingContent("");
        abortControllerRef.current = null;
      }
    },
    [agentId, apiEndpoint, messages]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Abort any in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        // Reset state
        setMessages([]);
        setStreamingContent("");
        setIsLoading(false);
        hasCalledComplete.current = false;
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  const handleDone = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[80vh] w-[500px] max-w-[90vw] flex-col p-0">
        <DialogHeader className="border-b border-slate-200 px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-3 py-4">
            {messages.map((message, index) => {
              // Check if this assistant message has been answered
              // (i.e., there's a user message after it)
              const isAnswered =
                message.role === "assistant" &&
                messages.slice(index + 1).some((m) => m.role === "user");

              return (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  onSend={handleSend}
                  isAnswered={isAnswered}
                />
              );
            })}
            {isLoading && streamingContent && (
              <ChatMessage
                role="assistant"
                content={streamingContent}
                isStreaming
              />
            )}
            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {isComplete ? (
          <div className="border-t border-slate-200 p-4">
            <Button onClick={handleDone} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <ChatInput
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Type your message..."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
