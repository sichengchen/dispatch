import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";

type DiscoverTabProps = {
  searchProvider: string;
  setSearchProvider: (value: string) => void;
  searchApiKey: string;
  setSearchApiKey: (value: string) => void;
  searchEndpoint: string;
  setSearchEndpoint: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
};

export function DiscoverTab({
  searchProvider,
  setSearchProvider,
  searchApiKey,
  setSearchApiKey,
  searchEndpoint,
  setSearchEndpoint,
  setErrorMessage
}: DiscoverTabProps) {
  const searchNeedsKey = searchProvider === "brave" || searchProvider === "serper";
  const missingSearchConfig = searchNeedsKey && !searchApiKey;

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Search</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure the web search provider for source discovery.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select
              value={searchProvider}
              onValueChange={(value) => {
                setSearchProvider(value);
                setErrorMessage(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brave">Brave Search</SelectItem>
                <SelectItem value="serper">Serper (Google)</SelectItem>
                <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {searchNeedsKey && (
            <div className="space-y-1">
              <Label>API Key</Label>
              <Input
                value={searchApiKey}
                onChange={(e) => {
                  setSearchApiKey(e.target.value);
                  setErrorMessage(null);
                }}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Endpoint (optional)</Label>
            <Input
              placeholder={
                searchProvider === "serper"
                  ? "https://google.serper.dev/search"
                  : searchProvider === "duckduckgo"
                    ? "https://api.duckduckgo.com/"
                    : "https://api.search.brave.com/res/v1/web/search"
              }
              value={searchEndpoint}
              onChange={(e) => {
                setSearchEndpoint(e.target.value);
                setErrorMessage(null);
              }}
            />
          </div>
        </div>
        {missingSearchConfig && (
          <div className="mt-2 text-xs text-amber-700">
            This provider requires an API key.
          </div>
        )}
      </div>
    </div>
  );
}
