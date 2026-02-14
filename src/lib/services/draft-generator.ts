import { gmail_v1 } from "googleapis";
import OpenAI from "openai";

export type DraftInput = {
  threadId: string;
  transcript: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string; // Original thread context
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Convert a spoken transcript into a professional email body using GPT-4o-mini.
 * Falls back to basic text cleanup if the API is unavailable.
 */
export async function generateDraftBody(input: DraftInput): Promise<string> {
  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional email writer. Convert the user's spoken transcript into a clear, professional email reply. Rules:
- Preserve the meaning and intent exactly — do not add or remove information
- Use a neutral, professional tone
- Keep it concise
- Do not add greetings like "Dear" or sign-offs like "Best regards" — just the body
- Fix grammar, filler words ("um", "uh", "like"), and spoken artifacts
- Output plain text only, no formatting`,
        },
        {
          role: "user",
          content: `Original email context (for reference only, do not quote it):\nSubject: ${input.subject}\nSnippet: ${input.snippet}\n\nMy spoken response to convert into an email:\n${input.transcript}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const body = response.choices[0]?.message?.content?.trim();
    if (body) return body;
  } catch (error) {
    console.error("GPT draft generation failed, using fallback:", error);
  }

  // Fallback: basic text cleanup
  return input.transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(um|uh|like|you know)\b\s*/gi, "")
    .replace(/\bi\b/g, "I")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase());
}

function buildRawMessage(input: DraftInput, body: string): string {
  const to = input.to.join(", ");
  const cc = input.cc.length > 0 ? input.cc.join(", ") : "";

  const messageParts = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: Re: ${input.subject.replace(/^(Re:\s*)+/i, "")}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  const message = messageParts.join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createGmailDraft(
  gmail: gmail_v1.Gmail,
  input: DraftInput
): Promise<string> {
  const body = await generateDraftBody(input);
  const encodedMessage = buildRawMessage(input, body);

  const draft = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: encodedMessage,
        threadId: input.threadId,
      },
    },
  });

  return draft.data.id || "";
}

export async function sendGmailReply(
  gmail: gmail_v1.Gmail,
  input: DraftInput,
  prePolishedBody?: string,
): Promise<string> {
  const body = prePolishedBody || (await generateDraftBody(input));
  const encodedMessage = buildRawMessage(input, body);

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: input.threadId,
    },
  });

  return sent.data.id || "";
}
