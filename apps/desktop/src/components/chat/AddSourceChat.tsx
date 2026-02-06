import { useState } from "react";
import { Button } from "../ui/button";
import { ChatDialog } from "./ChatDialog";

const ADD_SOURCE_INITIAL_MESSAGE = `Hi! I'll help you add a new website as a news source.

What's the URL of the website you'd like to add?`;

export function AddSourceChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Add
      </Button>
      <ChatDialog
        open={open}
        onOpenChange={setOpen}
        title="Add Source"
        agentId="add-source"
        initialMessage={ADD_SOURCE_INITIAL_MESSAGE}
      />
    </>
  );
}
