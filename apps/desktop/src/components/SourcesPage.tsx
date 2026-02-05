import { AddSourceDialog } from "./AddSourceDialog";
import { SourceList } from "./SourceList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

export function SourcesPage() {
  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 text-left">
          <div>
            <CardTitle className="text-base">Sources</CardTitle>
            <CardDescription>Add and manage your news sources.</CardDescription>
          </div>
          <AddSourceDialog />
        </CardHeader>
        <CardContent className="w-full">
          <Separator className="mb-3" />
          <div className="w-full text-left">
            <SourceList />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
