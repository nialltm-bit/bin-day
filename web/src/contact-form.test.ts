import { describe, expect, it } from "vitest";
import { checkContact, messageForContact, sendContact } from "./contact-form";

const FIELDS = { message: "Please delete my feed, I lost the link.", replyTo: "", website: "" };

function replying(body: unknown): { fetch: typeof fetch; sent: string[] } {
  const sent: string[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    return { json: async () => body };
  }) as unknown as typeof fetch;
  return { fetch: fake, sent };
}

describe("checkContact", () => {
  it("builds the request, leaving out an empty reply-to", () => {
    expect(checkContact(FIELDS)).toEqual({ ok: true, body: { action: "contact", message: FIELDS.message, website: "" } });
    const withReply = checkContact({ ...FIELDS, replyTo: " me@example.com " });
    expect(withReply.ok && withReply.body.reply_to).toBe("me@example.com");
  });
  it("sends the trap field as it is, so the script can see it was filled in", () => {
    const filled = checkContact({ ...FIELDS, website: "x" });
    expect(filled.ok && filled.body.website).toBe("x");
  });
  it("refuses a message that is too short or too long, and a long reply-to", () => {
    expect(checkContact({ ...FIELDS, message: "  hi  " }).ok).toBe(false);
    expect(checkContact({ ...FIELDS, message: "x".repeat(2001) }).ok).toBe(false);
    expect(checkContact({ ...FIELDS, replyTo: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("sendContact", () => {
  it("sends once and says thanks", async () => {
    const { fetch, sent } = replying({ ok: true });
    const result = await sendContact("https://script.example/exec", FIELDS, fetch);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("12 months");
    expect(JSON.parse(sent[0]).action).toBe("contact");
  });
  it("sends nothing when the check fails", async () => {
    const { fetch, sent } = replying({ ok: true });
    expect((await sendContact("https://script.example/exec", { ...FIELDS, message: "" }, fetch)).ok).toBe(false);
    expect(sent).toEqual([]);
  });
  it("gives a plain answer for each way the script can say no", async () => {
    for (const error of ["busy", "full", "message too long", "unexpected"]) {
      const result = await sendContact("https://script.example/exec", FIELDS, replying({ ok: false, error }).fetch);
      expect(result.ok).toBe(false);
      expect(result.text).toBe(messageForContact(error));
    }
  });
});
