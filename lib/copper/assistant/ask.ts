"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const APOLOGY =
  "Sorry, I couldn't answer that just now. Please try again in a moment.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = { steps: [], reply: "", status: "working" };

  // A fresh copy each time, so earlier updates never change underneath the panel.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });
  const send = () => update(snapshot());

  const toolStep = (id: string): ToolStep | undefined =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  async function run() {
    try {
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          // With tools off the model gets no instructions and no tools at all.
          ...(request.useTools
            ? {
                instructions: COPPER_INSTRUCTIONS,
                tools: copperTools,
                stopWhen: stepCountIs(MAX_STEPS),
              }
            : {}),
          messages: request.messages.map(({ role, content }) => ({
            role,
            content,
          })),
          providerOptions: THOUGHT_SUMMARIES,
        },
      );

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            const last = progress.steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else progress.steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            progress.steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          case "tool-call": {
            let step = toolStep(part.toolCallId);
            if (!step) {
              step = {
                type: "tool",
                id: part.toolCallId,
                name: part.toolName,
                state: "calling",
              };
              progress.steps.push(step);
            }
            step.input = part.input;
            break;
          }
          case "tool-result": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId);
            if (step) {
              step.output =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta":
            progress.reply += part.text;
            break;
          case "error":
            throw part.error;
          default:
            continue;
        }
        send();
      }

      // A stream that ends with nothing to say is still "done", with an apology.
      if (!progress.reply) progress.reply = APOLOGY;
      progress.status = "done";
      done(snapshot());
    } catch {
      if (!progress.reply) progress.reply = APOLOGY;
      progress.status = "error";
      done(snapshot());
    }
  }

  void run();
  return { progress: live };
}
