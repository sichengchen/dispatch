import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { ChatDialog } from "./ChatDialog";
import { trpc } from "../../lib/trpc";

const ADD_SOURCE_INITIAL_MESSAGE = `Hi! I'll help you add a new website as a news source.

What's the URL of the website you'd like to add?`;

export function AddSourceChat() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const handleComplete = useCallback(() => {
    // Refresh the sources list when a source is added
    utils.sources.list.invalidate();
    utils.articles.list.invalidate();
  }, [utils]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Add
      </Button>
      <ChatDialog
        open={open}
        onOpenChange={setOpen}
        title="Add Source"
        agentId="add-source"
        initialMessage={ADD_SOURCE_INITIAL_MESSAGE}
        onComplete={handleComplete}
      />
    </>
  );
}
