import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type OnboardingWizardProps = {
  onComplete: () => void;
};

type Step = "welcome" | "provider" | "source";

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <StepIndicator current={step} />
        {step === "welcome" && (
          <WelcomeStep onNext={() => setStep("provider")} />
        )}
        {step === "provider" && (
          <ProviderStep
            onNext={() => setStep("source")}
            onSkip={() => setStep("source")}
          />
        )}
        {step === "source" && (
          <SourceStep onComplete={onComplete} onSkip={onComplete} />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "welcome", label: "Welcome" },
    { key: "provider", label: "Provider" },
    { key: "source", label: "Source" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
              i <= currentIndex
                ? "bg-slate-900 text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`text-sm ${
              i <= currentIndex ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className="mx-1 h-px w-8 bg-slate-200" />
          )}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold text-slate-900">
        Welcome to The Dispatch
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        Your local-first, AI-native news reader. Dispatch pulls stories from
        your sources, summarizes them with AI, and generates daily digests — all
        running on your machine.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Let's get you set up in just a couple of steps.
      </p>
      <Button className="mt-6 w-full" onClick={onNext}>
        Get Started
      </Button>
    </div>
  );
}

function ProviderStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  const [providerType, setProviderType] = useState<
    "anthropic" | "openai-compatible"
  >("anthropic");
  const [name, setName] = useState("Anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [skipped, setSkipped] = useState(false);

  const addProvider = trpc.settings.addProvider.useMutation({
    onSuccess: onNext,
  });

  const handleSubmit = () => {
    if (!apiKey) return;
    addProvider.mutate({
      name,
      type: providerType,
      credentials: {
        apiKey,
        ...(providerType === "openai-compatible" && baseUrl
          ? { baseUrl }
          : {}),
      },
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Configure an AI Provider
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Dispatch uses LLMs to summarize articles, classify topics, and generate
        digests. Add a provider to enable these features.
      </p>

      <div className="mt-5 space-y-3">
        <div className="space-y-1">
          <Label>Provider Type</Label>
          <Select
            value={providerType}
            onValueChange={(value: "anthropic" | "openai-compatible") => {
              setProviderType(value);
              setName(value === "anthropic" ? "Anthropic" : "");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="openai-compatible">
                OpenAI Compatible
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {providerType === "openai-compatible" && (
          <>
            <div className="space-y-1">
              <Label>Provider Name</Label>
              <Input
                placeholder="My Provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label>API Key</Label>
          <Input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </div>

      {addProvider.error && (
        <div className="mt-2 text-xs text-red-600">
          {addProvider.error.message}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={!apiKey || !name || addProvider.isPending}
        >
          {addProvider.isPending ? "Saving..." : "Continue"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSkipped(true);
            onSkip();
          }}
        >
          Skip
        </Button>
      </div>

      {skipped && (
        <p className="mt-2 text-xs text-amber-600">
          LLM features won't work until you configure a provider in Settings.
        </p>
      )}
    </div>
  );
}

function SourceStep({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [url, setUrl] = useState("");
  const [added, setAdded] = useState(false);

  const utils = trpc.useUtils();
  const addSource = trpc.sources.add.useMutation({
    onSuccess: () => {
      setAdded(true);
      utils.sources.list.invalidate();
    },
  });

  const handleAdd = () => {
    if (!url) return;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      addSource.mutate({ url, name: hostname });
    } catch {
      addSource.mutate({ url, name: url });
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Add Your First Source
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Add an RSS feed or website URL to start collecting articles. You can
        always add more sources later.
      </p>

      <div className="mt-5 space-y-3">
        <div className="space-y-1">
          <Label>Feed or Website URL</Label>
          <Input
            placeholder="https://example.com/feed.xml"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={added}
          />
        </div>
      </div>

      {addSource.error && (
        <div className="mt-2 text-xs text-red-600">
          {addSource.error.message}
        </div>
      )}

      {added && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Source added successfully! It will be fetched shortly.
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {!added ? (
          <>
            <Button
              className="flex-1"
              onClick={handleAdd}
              disabled={!url || addSource.isPending}
            >
              {addSource.isPending ? "Adding..." : "Add Source"}
            </Button>
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={onComplete}>
            Finish Setup
          </Button>
        )}
      </div>
    </div>
  );
}
