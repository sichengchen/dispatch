import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { ChoiceOption } from "./choice-utils";

export interface ChoicePromptProps {
  question: string;
  options: ChoiceOption[];
  onSelect?: (value: string) => void;
  disabled?: boolean;
  selectedValue?: string;
}

export function ChoicePrompt({
  question,
  options,
  onSelect,
  disabled = false,
  selectedValue,
}: ChoicePromptProps) {
  return (
    <div
      className="my-2 rounded-lg border border-slate-200 bg-white p-3"
      role="group"
      aria-label={question}
    >
      <p className="mb-3 text-sm font-medium text-slate-700">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <Button
              key={option.value}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => onSelect?.(option.value)}
              className={cn(
                isSelected && "ring-2 ring-slate-400 ring-offset-1"
              )}
              aria-pressed={isSelected}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
