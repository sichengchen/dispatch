import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ChoicePrompt } from "./ChoicePrompt";
import { parseChoicesBlock, parseCompletionBlock } from "./choice-utils";

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  onSend?: (message: string) => void;
  isAnswered?: boolean;
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  onSend,
  isAnswered = false,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [selectedValue, setSelectedValue] = useState<string | undefined>();

  const handleChoiceSelect = useCallback(
    (value: string) => {
      setSelectedValue(value);
      onSend?.(value);
    },
    [onSend]
  );

  // Custom code block renderer for choices
  const components = {
    pre: ({ children }: { children?: React.ReactNode }) => {
      // Strip <pre> wrapper so custom blocks (choices/completion) can wrap text
      return <>{children}</>;
    },
    code: ({
      className,
      children,
    }: {
      className?: string;
      children?: React.ReactNode;
    }) => {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";

      // Check if this is a choices block
      if (language === "choices") {
        const codeContent = String(children).trim();
        const parsed = parseChoicesBlock(codeContent);

        if (parsed) {
          const isDisabled = isAnswered || selectedValue !== undefined || isStreaming;
          return (
            <ChoicePrompt
              question={parsed.question}
              options={parsed.options}
              onSelect={handleChoiceSelect}
              disabled={isDisabled}
              selectedValue={selectedValue}
            />
          );
        }
        // Fallback to raw code if parsing fails
      }

      // Check if this is a completion block
      if (language === "completion") {
        const codeContent = String(children).trim();
        const parsed = parseCompletionBlock(codeContent);

        if (parsed) {
          return (
            <div className="my-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
              <span className="text-xs font-medium [&_p]:inline">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.message}</ReactMarkdown>
              </span>
            </div>
          );
        }
        // Fallback to raw code if parsing fails
      }

      // Default code rendering
      return (
        <code className={className}>
          {children}
        </code>
      );
    },
  };

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-xs",
          isUser
            ? "bg-slate-900 text-white"
            : "bg-slate-100 text-slate-900",
          isStreaming && "animate-pulse"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-xs prose-slate max-w-none dark:prose-invert text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {content || (isStreaming ? "..." : "")}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
