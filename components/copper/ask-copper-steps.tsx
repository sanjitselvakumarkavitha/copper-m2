// How one Ask Copper answer is drawn: a vertical rail of "stations" (the tools
// Copper can use, its thinking, each tool it called) and then its reply.
// It only reads a Progress, so it never touches the database or the model.
import {
  BrainIcon,
  Loader2Icon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatUsd } from "@/lib/copper/catalog";
import {
  type Progress,
  type ToolStep,
  TOOL_LABELS,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

/** Renders **bold** and `code` marks, the only markdown the thinking summary uses. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="font-mono text-xs">
              {part.slice(1, -1)}
            </code>
          );
        return part;
      })}
    </>
  );
}

/** "copper-home" -> "Copper Home". */
function prettyId(id: unknown): string {
  return String(id)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "2026-11-14" -> "Nov 14, 2026", with no time-zone surprises. */
function prettyDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** One stop on the rail: a round node with an icon, a label, then its content. */
function Station({
  node,
  label,
  children,
}: {
  node: ReactNode;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative pl-10">
      <div className="ring-secondary absolute top-0 left-0 flex size-7 items-center justify-center rounded-full ring-4">
        {node}
      </div>
      {label && (
        <p className="text-muted-foreground pt-1 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Node({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-full",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** What Copper sent: a labelled list, never raw JSON. */
function SentInput({ step }: { step: ToolStep }) {
  const input = step.input;
  if (step.name === "get_prices")
    return <p className="text-sm">Nothing, it just asked for the price list</p>;
  if (step.name === "get_products")
    return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
  if (!isRecord(input))
    return (
      <p className="text-muted-foreground text-sm italic">
        filling in the details…
      </p>
    );

  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <div className="space-y-0.5">
        <Field label="Products">
          {products.length ? products.map(prettyId).join(", ") : "None"}
        </Field>
        <Field label="Plan">{prettyId(input.plan)}</Field>
        <Field label="Billing">{String(input.billing)}</Field>
        <Field label="Years">{String(input.years)}</Field>
      </div>
    );
  }
  if (step.name === "check_availability") {
    return (
      <div className="space-y-0.5">
        <Field label="Product">{prettyId(input.product)}</Field>
        <Field label="Color">
          {input.color ? String(input.color) : "All colors"}
        </Field>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      {Object.entries(input).map(([key, value]) => (
        <Field key={key} label={prettyId(key)}>
          {String(value)}
        </Field>
      ))}
    </div>
  );
}

const PILL = "rounded-full px-2 py-0.5 text-xs font-semibold";

function StockPill({
  stock,
  restockDate,
}: {
  stock: unknown;
  restockDate: unknown;
}) {
  if (stock === "backordered")
    return (
      <span className={cn(PILL, "bg-chart-3 text-primary-foreground")}>
        Back-ordered
        {typeof restockDate === "string" && ` until ${prettyDate(restockDate)}`}
      </span>
    );
  if (stock === "low_stock")
    return (
      <span className={cn(PILL, "bg-chart-4 text-primary-foreground")}>
        Low stock
      </span>
    );
  return (
    <span className={cn(PILL, "bg-accent text-accent-foreground")}>
      In stock
    </span>
  );
}

/** What came back, drawn for each tool. */
function Result({ step }: { step: ToolStep }) {
  const out = step.output;
  if (step.state === "error")
    return <p className="text-sm">{String(out ?? "That tool failed.")}</p>;
  if (!isRecord(out)) return null;

  if (step.name === "calculate_cost" && Array.isArray(out.lines)) {
    return (
      <div className="space-y-1 text-sm">
        {out.lines.map((line, i) =>
          isRecord(line) ? (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(line.item)}</span>
              <span className="font-medium">{formatUsd(Number(line.usd))}</span>
            </div>
          ) : null,
        )}
        <div className="border-border flex items-baseline justify-between border-t pt-1">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(Number(out.totalUsd))}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products" && Array.isArray(out.products)) {
    return (
      <div className="space-y-2 text-sm">
        {out.products.map((p, i) =>
          isRecord(p) ? (
            <div key={i}>
              <p className="flex justify-between font-medium">
                <span>{String(p.name)}</span>
                <span>{formatUsd(Number(p.priceUsd))}</span>
              </p>
              <p className="text-muted-foreground text-xs">{String(p.type)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Array.isArray(p.colors) ? p.colors : []).map((c) => (
                  <span
                    key={String(c)}
                    className={cn(PILL, "bg-accent/20 font-medium")}
                  >
                    {String(c)}
                  </span>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    );
  }

  if (step.name === "get_prices" && Array.isArray(out.products)) {
    const plans = Array.isArray(out.plans) ? out.plans : [];
    return (
      <div className="space-y-1 text-sm">
        {out.products.map((p, i) =>
          isRecord(p) ? (
            <p key={i} className="flex justify-between">
              <span>{String(p.name)}</span>
              <span className="font-medium">
                {formatUsd(Number(p.priceUsd))}
              </span>
            </p>
          ) : null,
        )}
        {plans.map((p, i) =>
          isRecord(p) && Number(p.monthlyUsd) > 0 ? (
            <p key={i} className="flex justify-between">
              <span>{String(p.name)}</span>
              <span className="font-medium">
                {formatUsd(Number(p.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(p.annualUsd))}/yr
              </span>
            </p>
          ) : null,
        )}
      </div>
    );
  }

  if (step.name === "check_availability") {
    if (out.status === "unavailable")
      return <p className="text-sm">{String(out.message)}</p>;
    if (out.status === "not_a_color") {
      const colors = Array.isArray(out.colors) ? out.colors.join(", ") : "";
      return (
        <p className="text-sm">
          {String(out.product)} doesn&apos;t come in {String(out.color)}. Its
          colors are {colors}.
        </p>
      );
    }
    if (Array.isArray(out.colors)) {
      return (
        <div className="space-y-1 text-sm">
          {out.colors.length === 0 && (
            <p>No stock information for that color.</p>
          )}
          {out.colors.map((c, i) =>
            isRecord(c) ? (
              <div key={i} className="flex items-center justify-between gap-3">
                <span>{String(c.color)}</span>
                <StockPill stock={c.stock} restockDate={c.restockDate} />
              </div>
            ) : null,
          )}
        </div>
      );
    }
  }

  return <p className="text-muted-foreground text-sm">{JSON.stringify(out)}</p>;
}

/** One tool call: always open, a round trip of "what Copper sent" and "what came back". */
function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card mt-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded-full px-1.5 text-[11px] font-medium">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name]}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          → What Copper sent
        </p>
        <SentInput step={step} />
      </div>
      <div className="border-border bg-accent/10 space-y-1 border-t px-3 py-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          ← What came back
        </p>
        {step.state === "calling" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm italic">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            the app is running the code…
          </p>
        ) : (
          <Result step={step} />
        )}
      </div>
    </div>
  );
}

function workingText(progress: Progress, useTools: boolean) {
  if (progress.reply) return "Writing the answer…";
  if (progress.steps.length) return "Deciding what to do next…";
  return useTools ? "Reading your question…" : "Answering from memory…";
}

/** One answer from Copper: the stations in the order they happened, then the reply. */
export function AnswerView({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const used = new Set(
    progress.steps.flatMap((s) => (s.type === "tool" ? [s.name] : [])),
  );
  const working = progress.status === "working";

  return (
    <div className="space-y-2">
      <div className="relative space-y-4">
        <div
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-3.5 w-0.5 rounded-full",
            useTools
              ? "from-primary via-accent to-accent bg-linear-to-b"
              : "bg-chart-3",
          )}
        />

        <Station
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
          node={
            <Node
              icon={WrenchIcon}
              className={
                useTools
                  ? "bg-primary text-primary-foreground"
                  : "bg-chart-3 text-primary-foreground"
              }
            />
          }
        >
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.keys(TOOL_LABELS).map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  !useTools && "line-through opacity-60",
                  useTools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {progress.steps.map((step, i) => {
          if (step.type === "thinking") {
            return (
              <Station
                key={i}
                label="Copper is thinking"
                node={
                  <Node
                    icon={BrainIcon}
                    className={
                      useTools
                        ? "bg-primary text-primary-foreground"
                        : "bg-chart-3 text-primary-foreground"
                    }
                  />
                }
              >
                <div
                  data-testid="thinking"
                  className="border-border text-muted-foreground mt-1 space-y-1 border-l-2 pl-3 text-sm italic"
                >
                  {step.text.split(/\n\n+/).map((paragraph, j) => (
                    <p key={j}>
                      <Inline text={paragraph} />
                    </p>
                  ))}
                </div>
              </Station>
            );
          }
          const toolNumber =
            progress.steps.slice(0, i).filter((s) => s.type === "tool").length +
            1;
          return (
            <Station
              key={step.id}
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
              node={
                <Node
                  icon={WrenchIcon}
                  className="bg-accent text-accent-foreground"
                />
              }
            >
              <ToolCard step={step} number={toolNumber} />
            </Station>
          );
        })}

        {working && (
          <Station
            node={
              <span className="bg-card flex size-7 items-center justify-center gap-0.5 rounded-full">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="bg-primary size-1 animate-bounce rounded-full"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            }
          >
            <p className="text-muted-foreground pt-1 text-sm">
              {workingText(progress, useTools)}
            </p>
          </Station>
        )}
      </div>

      {(progress.reply || !working) && (
        <div className="bg-card ml-10 rounded-2xl rounded-tl-sm border px-3 py-2 text-sm shadow-xs">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border px-2 py-1.5 text-xs">
              <p>
                ⚠ <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="text-muted-foreground mt-0.5">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span aria-hidden className="ml-0.5 animate-pulse">
                ▍
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
