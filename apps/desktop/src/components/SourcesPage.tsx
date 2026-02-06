import { AddSourceDialog } from "./AddSourceDialog";
import { SourceList } from "./SourceList";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

export function SourcesPage() {
  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between text-left">
          <CardTitle className="text-base">Sources</CardTitle>
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
