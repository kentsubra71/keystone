import { gmail_v1 } from "googleapis";

export type DraftInput = {
  threadId: string;
  transcript: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
};

export function generateDraftBody(input: DraftInput): string {
  // Clean and format the transcript into a professional email
  const cleanedTranscript = input.transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bi\b/g, "I"); // Capitalize 'I'

  // Simple formatting - capitalize first letter of sentences
  const formattedBody = cleanedTranscript
    .split(/([.!?]\s+)/)
    .map((segment, index) => {
      if (index % 2 === 0 && segment.length > 0) {
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      }
      return segment;
    })
    .join("");

  return formattedBody;
}

export async function createGmailDraft(
  gmail: gmail_v1.Gmail,
  input: DraftInput
): Promise<string> {
  const body = generateDraftBody(input);

  // Build the email message
  const to = input.to.join(", ");
  const cc = input.cc.length > 0 ? input.cc.join(", ") : "";

  const messageParts = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    `Subject: Re: ${input.subject.replace(/^Re:\s*/i, "")}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].filter(Boolean);

  const message = messageParts.join("\r\n");

  // Base64 encode the message
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Create the draft
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
