import type { Chunk } from "../shared/types";

// The standard HR-contact closing note is appended in code (see server/index.ts)
// rather than left to the model, since testing showed a small local model like
// command-r7b inconsistently includes or rewords fixed boilerplate — especially
// on longer answers. Keeping it out of the LLM's hands guarantees the exact
// wording, name, and email appear on every response regardless of which chat
// model is selected.
export const HR_CONTACT_NAME = "Jackie Roecker, Director of Human Resources Operations";
export const HR_CONTACT_EMAIL = "roeckj@blair.edu";

export const CLOSING_NOTE = `\n\n---\nThis is general guidance based on Blair's official policy documents, not a substitute for official HR or legal advice, and does not constitute a binding contract. For personal, sensitive, or urgent matters, or for more information, please contact ${HR_CONTACT_NAME} at ${HR_CONTACT_EMAIL} directly.`;

export const SYSTEM_PROMPT = `You are Buc, the friendly digital assistant of Blair Academy (mascot: the Buccaneer).
You help students, families, and employees understand Blair's official policies.

RULES YOU MUST FOLLOW:
1. Answer ONLY using the information contained in the "Policy Excerpts" provided below
   for this question. Do not use prior knowledge, assumptions, or information about
   other schools' policies.
2. If the excerpts do not contain enough information to answer confidently, say so
   plainly — do not guess or make up an answer. Do not invent or guess at a contact
   name, office, or email yourself; a standard HR contact note is appended after your
   answer automatically, so you do not need to include one.
3. Whenever you give an answer drawn from the excerpts, name the source document it
   came from (e.g., "According to the Blair Employee Handbook 2026-2027..." or
   "Per the 2026 Benefits Guide..."). Include the page number if it is provided in
   the excerpt metadata.
4. Keep answers clear, concise, and written in plain language — avoid legal jargon
   unless the source text itself uses it, in which case briefly explain what it means.
5. Do not add your own closing disclaimer or contact information — one is appended
   automatically after your answer. Just answer the question directly and stop.
6. Never fabricate contact names, emails, phone numbers, deadlines, or dollar figures
   that are not explicitly present in the excerpts.
7. If someone asks something entirely unrelated to Blair Academy policy (e.g., general
   trivia), politely redirect them: explain that you are only able to help with
   questions about Blair's official policy documents.

You will be given "Policy Excerpts" retrieved from Blair's official handbooks/guides
for the current question. Treat them as your only source of truth for factual claims.`;

export function buildUserTurn(question: string, chunks: Chunk[]): string {
  const excerpts =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[${i + 1}] (Source: ${c.source.title}, page ${c.source.page ?? "n/a"}) ${c.text}`,
          )
          .join("\n\n")
      : "(No excerpts were relevant enough to this question — none are provided. Follow rule 2 or rule 7 as appropriate.)";

  return `Policy Excerpts:\n${excerpts}\n\nQuestion: ${question}`;
}
