import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { type ChatMessage, chatUserTurn } from "~/recipe-chat";
import { FORMAT_RULES } from "~/recipe-format-prompt";
import { parseRecipeText } from "~/recipe-import";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You help a German-speaking family come up with recipes and refine them, in a chat inside their shopping app.
Each message from them starts with the recipe draft as it currently stands (they may have edited it by hand), then what they ask.
Answer with:
- reply: a short answer in German, unless they write in another language. Don't repeat the recipe here.
- text: the whole recipe, revised, when it should change; null when it stays as it is (a question, say).
The recipe is in this plain-text format, which the app imports:

${FORMAT_RULES}

- Write the recipe in German, unless asked otherwise.
- Keep everything about the draft they didn't ask to change, including their own edits.
- If they've written down general preferences below, follow them in the recipes you suggest, unless they ask for something else.`;

const ResponseSchema = z.object({ reply: z.string(), text: z.string().nullable() });

type Item = { name: string; plural: string | null };

// The household's items, so ingredients match them rather than becoming new items. Cached, as it's the same every turn.
function itemsBlock(items: Item[]) {
  const names = items.map((i) => (i.plural ? `${i.name} (${i.plural})` : i.name)).sort((a, b) => a.localeCompare(b, "de"));
  return {
    type: "text" as const,
    text: `The items they already buy, with plurals in parentheses. When an ingredient is one of these, use its name (or its plural for several pieces), exactly as written:\n${names.join("\n")}`,
    cache_control: { type: "ephemeral" as const },
  };
}

// The household's own words on how they like to eat; in the cached part, as it rarely changes
function preferencesBlock(preferences: string | null) {
  return preferences ? [{ type: "text" as const, text: `Their general preferences, in their words:\n${preferences}` }] : [];
}

// One chat turn: `chat` is the conversation so far, `draftText` the draft as it stands now.
// The draft goes into the latest message only, so earlier turns stay as written and the history caches.
export async function chatRecipe({ chat, draftText, message, items, preferences }: {
  chat: ChatMessage[];
  draftText: string;
  message: string;
  items: Item[];
  preferences: string | null;
}): Promise<{ reply: string; text: string | null } | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Für den Chat muss ANTHROPIC_API_KEY gesetzt sein." };

  const client = new Anthropic();
  const system = [{ type: "text" as const, text: SYSTEM }, ...preferencesBlock(preferences), itemsBlock(items)];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...chat.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: chatUserTurn(message, draftText) },
  ];
  const ask = () => client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ResponseSchema) },
    system,
    messages,
  });

  try {
    const response = await ask();
    const answer = response.parsed_output;
    if (response.stop_reason === "refusal" || !answer) return { error: "Claude hat nicht geantwortet; bitte anders formulieren." };
    if (answer.text == null) return { reply: answer.reply.trim(), text: null };

    // One more go at a text the import wouldn't take; what's left shows as errors in the preview
    const { errors } = parseRecipeText(answer.text, items);
    if (errors.length === 0) return { reply: answer.reply.trim(), text: answer.text.trim() };
    messages.push(
      { role: "assistant", content: JSON.stringify(answer) },
      { role: "user", content: `Die App kann den Text so nicht importieren:\n${errors.map((e) => (e.line != null ? `Zeile ${e.line}: ` : "") + e.message).join("\n")}\nBitte korrigieren.` },
    );
    const fixed = (await ask()).parsed_output?.text;
    return { reply: answer.reply.trim(), text: (fixed ?? answer.text).trim() };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { error: "Der ANTHROPIC_API_KEY wurde abgelehnt." };
    if (error instanceof Anthropic.RateLimitError) return { error: "Zu viele Anfragen auf einmal; bitte in einer Minute noch mal versuchen." };
    if (error instanceof Anthropic.APIError) return { error: `Claude konnte nicht antworten (${error.status ?? "keine Verbindung"}).` };
    // Anything else (an answer that doesn't parse, say) would replace the page with the error page
    console.error(error);
    return { error: "Claude konnte nicht antworten; bitte noch mal versuchen." };
  }
}
