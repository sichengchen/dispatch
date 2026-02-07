import { AddSourceChat } from "./chat";
import { SourceList } from "./SourceList";
import { SourceArticlesPanel } from "./SourceArticlesPanel";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

interface SourcesPageProps {
  onSelectArticle: (id: number) => void;
}

export function SourcesPage({ onSelectArticle }: SourcesPageProps) {
  return (
    <div className="flex h-full gap-4">
      <Card className="flex w-80 shrink-0 flex-col overflow-hidden">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between text-left">
          <CardTitle className="text-base">Sources</CardTitle>
          <AddSourceChat />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          <Separator className="mb-3" />
          <div className="text-left">
            <SourceList />
          </div>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CardContent className="min-h-0 flex-1 p-0">
          <SourceArticlesPanel onSelectArticle={onSelectArticle} />
        </CardContent>
      </Card>
    </div>
  );
}
