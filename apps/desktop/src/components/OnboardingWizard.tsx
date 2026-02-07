import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { ProvidersSection } from "./settings/ProvidersSection";
import { ModelsTab } from "./settings/ModelsTab";
import { RouterTab } from "./settings/RouterTab";
import {
  type CatalogEntry,
  type RoutingState,
  TASKS,
} from "./settings/types";

type OnboardingWizardProps = {
  onComplete: () => void;
};

type Step = "welcome" | "providers" | "models" | "router" | "source";

const STEPS: { key: Step; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "providers", label: "Providers" },
  { key: "models", label: "Models" },
  { key: "router", label: "Tasks" },
  { key: "source", label: "Source" },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <StepIndicator current={step} />
        {step === "welcome" && (
          <WelcomeStep onNext={() => setStep("providers")} />
        )}
        {step === "providers" && (
          <ProvidersStep
            onNext={() => setStep("models")}
            onSkip={() => setStep("models")}
          />
        )}
        {step === "models" && (
          <ModelsStep
            onNext={() => setStep("router")}
            onSkip={() => setStep("router")}
          />
        )}
        {step === "router" && (
          <RouterStep
            onNext={() => setStep("source")}
            onSkip={() => setStep("source")}
          />
        )}
        {step === "source" && <SourceStep onComplete={onComplete} />}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-3">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
              i <= currentIndex
                ? "bg-slate-900 text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className="h-px w-6 bg-slate-200" />
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
        Let's get you set up in a few quick steps.
      </p>
      <Button className="mt-6 w-full" onClick={onNext}>
        Get Started
      </Button>
    </div>
  );
}

function ProvidersStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Set Up Providers
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Dispatch uses LLMs to summarize articles, classify topics, and generate
        digests. Add at least one AI provider to enable these features.
      </p>

      <ProvidersSection />

      <div className="mt-6 flex gap-2">
        <Button className="flex-1" onClick={onNext}>
          Continue
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function ModelsStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Add Models
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Add models from your configured providers. These will be available for
        task assignments in the next step.
      </p>

      <ModelsTab />

      <div className="mt-6 flex gap-2">
        <Button className="flex-1" onClick={onNext}>
          Continue
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function RouterStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: onNext,
  });

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [routing, setRouting] = useState<RoutingState>({
    summarize: "",
    classify: "",
    grade: "",
    embed: "",
    digest: "",
    skill: "",
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const llm = settingsQuery.data.models;

    const nextCatalog: CatalogEntry[] =
      llm.catalog && llm.catalog.length > 0
        ? llm.catalog.map((entry) => ({
            id: entry.id,
            providerId: entry.providerId,
            model: entry.model,
            label: entry.label ?? "",
            capabilities: entry.capabilities ?? ["chat"],
          }))
        : [];

    const nextRouting: RoutingState = {
      summarize: "",
      classify: "",
      grade: "",
      embed: "",
      digest: "",
      skill: "",
    };

    for (const task of TASKS) {
      const assignment = llm.assignment.find((item) => item.task === task.id);
      if (assignment) {
        const entry = nextCatalog.find((e) => e.id === assignment.modelId);
        if (entry) {
          nextRouting[task.id] = entry.id;
        }
      }
    }

    // Auto-assign unassigned tasks to compatible models
    if (nextCatalog.length > 0) {
      for (const task of TASKS) {
        if (!nextRouting[task.id]) {
          const fallback = nextCatalog.find((entry) => {
            const caps = entry.capabilities ?? [];
            if (task.id === "embed") return caps.includes("embedding");
            return caps.includes("chat") || caps.length === 0;
          });
          if (fallback) {
            nextRouting[task.id] = fallback.id;
          }
        }
      }
    }

    setCatalog(nextCatalog);
    setRouting(nextRouting);
  }, [settingsQuery.data]);

  const handleSave = () => {
    if (!settingsQuery.data) {
      onNext();
      return;
    }

    const resolvedModels = TASKS.filter((task) => {
      const routedModelId = routing[task.id];
      return routedModelId && catalog.find((item) => item.id === routedModelId);
    }).map((task) => ({
      task: task.id,
      modelId: routing[task.id],
    }));

    const existing = settingsQuery.data;

    updateSettings.mutate({
      providers: existing.providers ?? [],
      models: {
        assignment: resolvedModels,
        catalog: existing.models.catalog ?? [],
      },
      grading: existing.grading,
      digest: existing.digest,
      agent: existing.agent,
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Assign Models to Tasks
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose which model handles each task. You can change these later in
        Settings.
      </p>

      <RouterTab catalog={catalog} routing={routing} setRouting={setRouting} />

      <div className="mt-6 flex gap-2">
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={updateSettings.isPending}
        >
          {updateSettings.isPending ? "Saving..." : "Continue"}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>

      {updateSettings.error && (
        <div className="mt-2 text-xs text-red-600">
          {updateSettings.error.message}
        </div>
      )}
    </div>
  );
}

function SourceStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Add Your First Source
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        You're almost done! To start collecting articles, head over to the{" "}
        <span className="font-medium text-slate-900">Sources</span> tab and add
        an RSS feed or website URL.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        You can add as many sources as you like — Dispatch will automatically
        fetch and process new articles from each one.
      </p>

      <Button className="mt-6 w-full" onClick={onComplete}>
        Finish Setup
      </Button>
    </div>
  );
}
