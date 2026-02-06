import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { type CatalogEntry, type RoutingState, TASKS } from "./types";

type RouterTabProps = {
  catalog: CatalogEntry[];
  routing: RoutingState;
  setRouting: React.Dispatch<React.SetStateAction<RoutingState>>;
};

export function RouterTab({ catalog, routing, setRouting }: RouterTabProps) {
  const hasCatalog = catalog.length > 0;

  return (
    <div className="mt-4 space-y-3">
      {TASKS.map((task) => {
        const selectedId = routing[task.id];
        const options = catalog.filter((entry) => {
          if (task.id === "embed") return entry.capabilities.includes("embedding");
          return entry.capabilities.includes("chat") || entry.capabilities.length === 0;
        });
        return (
          <div
            key={task.id}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">{task.label}</div>
              <div className="text-xs text-slate-500">{task.hint}</div>
            </div>
            <div className="mt-3 space-y-1">
              <Label>Model</Label>
              <Select
                value={selectedId}
                onValueChange={(value) => {
                  setRouting((prev) => ({
                    ...prev,
                    [task.id]: value
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label?.trim() || entry.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {options.length === 0 && (
                <div className="text-xs text-amber-700">
                  Add a compatible model in Models.
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!hasCatalog && (
        <div className="rounded border border-dashed border-slate-200 p-4 text-xs text-slate-500">
          Add models in the Models tab to configure routing.
        </div>
      )}
    </div>
  );
}
