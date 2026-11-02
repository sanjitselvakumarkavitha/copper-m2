"use client";

// The floating Ask Copper chat: a launcher button and a side panel. Tools on
// and tools off are two separate conversations, so the tools-off model never
// sees (and copies) an answer the tools worked out.
import {
  ArrowUpIcon,
  MessageCircleIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnswerView } from "@/components/copper/ask-copper-steps";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const APOLOGY =
  "Sorry, I couldn't answer that just now. Please try again in a moment.";

type Turn = { id: number; question: string; progress: Progress };
type Mode = "on" | "off";

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [input, setInput] = useState("");
  const [chats, setChats] = useState<Record<Mode, Turn[]>>({ on: [], off: [] });
  const nextId = useRef(0);
  const body = useRef<HTMLDivElement>(null);

  const mode: Mode = useTools ? "on" : "off";
  const turns = chats[mode];
  const busy = turns.at(-1)?.progress.status === "working";

  // Open from the header link or a /#ask address. Listening for the click as
  // well as the address change matters: once the address already ends in
  // #ask, clicking the link again fires no hashchange.
  useEffect(() => {
    const openIfAsk = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[href$="#ask"]'))
        setOpen(true);
    };
    openIfAsk();
    window.addEventListener("hashchange", openIfAsk);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openIfAsk);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [chats, mode]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const key = mode;
    const history: ChatMessage[] = chats[key].flatMap((turn) =>
      turn.progress.status === "done" && turn.progress.reply
        ? [
            { role: "user" as const, content: turn.question },
            { role: "assistant" as const, content: turn.progress.reply },
          ]
        : [],
    );
    const id = nextId.current++;
    const patch = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [key]: all[key].map((turn) =>
          turn.id === id ? { ...turn, progress } : turn,
        ),
      }));

    setChats((all) => ({
      ...all,
      [key]: [
        ...all[key],
        {
          id,
          question: text,
          progress: { steps: [], reply: "", status: "working" },
        },
      ],
    }));
    setInput("");

    try {
      const result = await askCopper({
        messages: [...history, { role: "user", content: text }],
        useTools: key === "on",
      });
      for await (const progress of readLive(result.progress)) patch(progress);
    } catch {
      patch({ steps: [], reply: APOLOGY, status: "error" });
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        aria-label="Ask Copper"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground focus-visible:ring-ring fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
      >
        <MessageCircleIcon className="size-5" aria-hidden />
        Ask Copper
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <header className="bg-chart-5 text-secondary">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                <SparklesIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-secondary text-base">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-secondary/80 text-xs">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  className="text-secondary hover:bg-secondary/10 hover:text-secondary"
                >
                  <XIcon className="size-4" aria-hidden />
                </Button>
              </SheetClose>
            </div>
            <div className="bg-secondary/10 flex items-center gap-3 px-4 py-2 text-sm">
              <span className="font-medium">Use tools</span>
              <span className="text-secondary/70 text-xs">
                {useTools ? "Checks every answer" : "Model guesses alone"}
              </span>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
                className="ml-auto"
              />
            </div>
          </header>

          <div ref={body} className="bg-secondary flex-1 overflow-y-auto p-4">
            {!aiConfigured ? (
              <SetupRequired service="ai" />
            ) : (
              <div className="space-y-5">
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <AnswerView progress={turn.progress} useTools={useTools} />
                  </div>
                ))}
                {!busy && (
                  <div className="space-y-2">
                    {turns.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        Hi, I&apos;m Copper. Ask me about prices, totals or
                        stock, or try one of these:
                      </p>
                    )}
                    <div className="flex flex-col items-start gap-2">
                      {STARTERS.map((starter) => (
                        <Button
                          key={starter}
                          type="button"
                          variant="outline"
                          className="bg-card h-auto justify-start py-2 text-left whitespace-normal"
                          onClick={() => send(starter)}
                        >
                          {starter}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {aiConfigured && (
            <form
              className="bg-background flex items-center gap-2 border-t p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <Input
                aria-label="Your question"
                placeholder="Ask about prices, totals or stock…"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="rounded-full"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={busy || !input.trim()}
                className="rounded-full"
              >
                <ArrowUpIcon className="size-4" aria-hidden />
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
