import * as React from "react";
import { cn } from "../../lib/utils";

type AutocompleteOption = {
  value: string;
  label: string;
};

type AutocompleteProps = {
  options: AutocompleteOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  excludeValues?: string[];
};

export function Autocomplete({
  options,
  placeholder = "Search...",
  onSelect,
  disabled,
  excludeValues = []
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = React.useMemo(() => {
    const query = inputValue.toLowerCase().trim();
    return options.filter(
      (opt) =>
        !excludeValues.includes(opt.value) &&
        (opt.label.toLowerCase().includes(query) ||
          opt.value.toLowerCase().includes(query))
    );
  }, [options, inputValue, excludeValues]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setInputValue("");
    setOpen(false);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filteredOptions.map((opt) => (
            <div
              key={opt.value}
              className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      {open && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
          No matches found
        </div>
      )}
    </div>
  );
}
