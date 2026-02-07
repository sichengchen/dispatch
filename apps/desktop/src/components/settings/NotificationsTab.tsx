import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

type NotificationsTabProps = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  botToken: string;
  setBotToken: (value: string) => void;
  chatId: string;
  setChatId: (value: string) => void;
  sendDigests: boolean;
  setSendDigests: (value: boolean) => void;
  sendBreakingNews: boolean;
  setSendBreakingNews: (value: boolean) => void;
  breakingNewsThreshold: number;
  setBreakingNewsThreshold: (value: number) => void;
};

export function NotificationsTab({
  enabled,
  setEnabled,
  botToken,
  setBotToken,
  chatId,
  setChatId,
  sendDigests,
  setSendDigests,
  sendBreakingNews,
  setSendBreakingNews,
  breakingNewsThreshold,
  setBreakingNewsThreshold
}: NotificationsTabProps) {
  const [showPairing, setShowPairing] = useState(false);
  const [tokenLocked, setTokenLocked] = useState(false);
  const [initialBotToken, setInitialBotToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [hasUserEditedToken, setHasUserEditedToken] = useState(false);
  const handledPairingRef = useRef(false);

  const utils = trpc.useUtils();

  const deliveryStatusQuery = trpc.notifications.getDeliveryStatus.useQuery(undefined, {
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const pairingStatusQuery = trpc.notifications.getPairingStatus.useQuery(undefined, {
    enabled: showPairing,
    refetchInterval: showPairing ? 2000 : false // Poll every 2 seconds when pairing
  });

  const generatePairingCode = trpc.notifications.generatePairingCode.useMutation({
    onSuccess: () => {
      setShowPairing(true);
      toast.success("Pairing code generated!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate pairing code");
    }
  });

  const clearPairingCode = trpc.notifications.clearPairingCode.useMutation({
    onSuccess: () => {
      setShowPairing(false);
    }
  });

  const testNotification = trpc.notifications.testNotification.useMutation({
    onSuccess: () => {
      toast.success("Test notification sent successfully!");
      deliveryStatusQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send test notification");
    }
  });

  const updateNotifications = trpc.notifications.updateSettings.useMutation({
    onSuccess: () => {
      utils.notifications.getSettings.invalidate();
      utils.settings.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save bot token");
    }
  });

  // Initialize token lock state from loaded settings (not from user typing).
  useEffect(() => {
    if (!hasUserEditedToken && botToken && !initialBotToken) {
      setInitialBotToken(botToken);
      setTokenLocked(true);
    }
  }, [botToken, initialBotToken, hasUserEditedToken]);

  // Auto-populate chat ID when pairing succeeds
  useEffect(() => {
    if (pairingStatusQuery.data?.isPaired && pairingStatusQuery.data.chatId) {
      if (handledPairingRef.current) return;
      handledPairingRef.current = true;
      setChatId(pairingStatusQuery.data.chatId);
      setShowPairing(false);
      toast.success("Successfully paired with Telegram chat!");
      clearPairingCode.mutate();
    }
  }, [pairingStatusQuery.data?.isPaired, pairingStatusQuery.data?.chatId, setChatId, clearPairingCode]);

  const handleSaveToken = async () => {
    if (!botToken.trim()) {
      toast.error("Please enter a bot token");
      return;
    }

    setSavingToken(true);
    try {
      await updateNotifications.mutateAsync({
        enabled,
        providers: {
          telegram: {
            botToken: botToken.trim(),
            chatId: chatId.trim(),
            sendDigests,
            sendBreakingNews,
            breakingNewsThreshold
          }
        }
      });
      setTokenLocked(true);
      setInitialBotToken(botToken);
      setHasUserEditedToken(false);
      toast.success("Bot token saved! You can now generate a pairing code.");
    } catch (error) {
      console.error("Error saving token:", error);
    } finally {
      setSavingToken(false);
    }
  };

  const handleModifyToken = () => {
    setTokenLocked(false);
    setHasUserEditedToken(false);
  };

  const handleGeneratePairingCode = () => {
    if (!tokenLocked) {
      toast.error("Please save your bot token first");
      return;
    }
    handledPairingRef.current = false;
    generatePairingCode.mutate();
  };

  const handleCancelPairing = () => {
    clearPairingCode.mutate();
  };

  const handleCopyCode = () => {
    if (pairingStatusQuery.data?.code) {
      navigator.clipboard.writeText(pairingStatusQuery.data.code);
      toast.success("Pairing code copied to clipboard!");
    }
  };

  const handleTest = () => {
    testNotification.mutate();
  };

  const lastDigestStatus = deliveryStatusQuery.data?.lastDigestSent
    ? `Last digest sent: ${new Date(deliveryStatusQuery.data.lastDigestSent).toLocaleString()} ✓`
    : deliveryStatusQuery.data?.lastError
    ? `Failed to send ✗`
    : "No digest sent yet";

  return (
    <div className="space-y-4 py-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Telegram Notifications</div>
        <div className="mt-1 text-xs text-slate-500">
          Receive daily digests and breaking news alerts directly in Telegram.
        </div>

        <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-notifications">Enable notifications</Label>
            <div className="text-[11px] text-slate-500">
              Send notifications to your configured Telegram chat
            </div>
          </div>
          <Switch id="enable-notifications" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bot-token" className="text-sm text-slate-700">Bot Token</Label>
          <div className="flex items-center gap-2">
            <Input
              id="bot-token"
              type="password"
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              value={botToken}
              onChange={(e) => {
                setHasUserEditedToken(true);
                setBotToken(e.target.value);
              }}
              disabled={!enabled || tokenLocked}
              className="flex-1 text-sm"
            />
            {tokenLocked ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleModifyToken}
                disabled={!enabled}
                className="shrink-0"
              >
                Modify
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveToken}
                disabled={!enabled || !botToken.trim() || savingToken}
                className="shrink-0"
              >
                {savingToken ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            Create a bot via{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700"
            >
              @BotFather
            </a>{" "}
            on Telegram. Save the token before generating a pairing code.
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-slate-700">Chat Connection</Label>
          <div className="text-[11px] text-slate-500">
            Pair this app with a Telegram chat to receive notifications.
          </div>

          {!chatId ? (
            <>
              {!showPairing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGeneratePairingCode}
                      disabled={!enabled || !tokenLocked || generatePairingCode.isPending}
                    >
                      {generatePairingCode.isPending ? "Generating..." : "Generate Pairing Code"}
                    </Button>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {!tokenLocked
                      ? "Save your bot token first to generate a pairing code"
                      : "Generate a code to pair your Telegram chat with this app"}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-700">Your Pairing Code:</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded border border-slate-200 bg-white px-3 py-2 font-mono text-2xl font-bold tracking-wider text-slate-900">
                        {pairingStatusQuery.data?.code || "------"}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCode}
                        disabled={!pairingStatusQuery.data?.code}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="font-medium">How to pair:</div>
                    <ol className="ml-4 list-decimal space-y-1">
                      <li>Open Telegram and find your bot</li>
                      <li>Send the command: <code className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-slate-700">/pair {pairingStatusQuery.data?.code || "CODE"}</code></li>
                      <li>Works in both DMs and groups</li>
                    </ol>
                  </div>

                  {pairingStatusQuery.data?.expiresAt && (
                    <div className="text-[11px] text-slate-500">
                      Code expires: {new Date(pairingStatusQuery.data.expiresAt).toLocaleTimeString()}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelPairing}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
                <span className="text-emerald-600">✓</span>
                <span className="truncate text-sm text-slate-700">Connected to chat: <span className="font-mono">{chatId}</span></span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChatId("")}
                disabled={!enabled}
              >
                Disconnect
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="send-digests">Send daily digests</Label>
            <div className="text-[11px] text-slate-500">
              Automatically send digest after generation
            </div>
          </div>
          <Switch id="send-digests" checked={sendDigests} onCheckedChange={setSendDigests} disabled={!enabled} />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="send-breaking-news">Send breaking news alerts</Label>
            <div className="text-[11px] text-slate-500">
              Alert for high-grade articles (processed within last 30 min)
            </div>
          </div>
          <Switch
            id="send-breaking-news"
            checked={sendBreakingNews}
            onCheckedChange={setSendBreakingNews}
            disabled={!enabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="threshold" className="text-sm text-slate-700">Breaking news grade threshold</Label>
          <div className="flex items-center gap-2">
            <Input
              id="threshold"
              type="number"
              min="0"
              max="100"
              value={breakingNewsThreshold}
              onChange={(e) => setBreakingNewsThreshold(Number(e.target.value))}
              disabled={!enabled || !sendBreakingNews}
              className="w-24 text-sm"
            />
            <span className="text-sm text-slate-500">/ 100</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Only send alerts for articles with grade ≥ this threshold
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Delivery Status</Label>
              <div className="text-[11px] text-slate-500">{lastDigestStatus}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testNotification.isPending || !botToken || !chatId}
            >
              {testNotification.isPending ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
