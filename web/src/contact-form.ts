/** The contact form on the privacy page. The message goes to the script, which keeps it in a private Sheet. */
import { el } from "./dom";
import { post } from "./signup";

export const MAX_MESSAGE = 2000;
export const MIN_MESSAGE = 5;

export interface ContactFields {
  message: string;
  replyTo: string;
  /** The hidden trap field. A person never fills it in. */
  website: string;
}

export type ContactCheck = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/** Checks what was typed before sending, the same limits the script has, and builds what is sent. */
export function checkContact(fields: ContactFields): ContactCheck {
  const message = fields.message.trim();
  if (message.length < MIN_MESSAGE) return { ok: false, error: "Write a few words so we know what you need." };
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Please keep it under ${MAX_MESSAGE} characters.` };
  const replyTo = fields.replyTo.trim();
  if (replyTo.length > 200) return { ok: false, error: "That reply address is too long." };
  const body: Record<string, unknown> = { action: "contact", message, website: fields.website };
  if (replyTo !== "") body.reply_to = replyTo;
  return { ok: true, body };
}

export function messageForContact(error: string | null): string {
  switch (error) {
    case null:
      return "Thanks, we've got your message. We only reply if you left a way to reply. We keep messages for 12 months, then delete them.";
    case "busy":
      return "We've had a lot of messages this hour. Please try again a little later.";
    case "full":
      return "We can't take more messages right now. Please try again later.";
    case "message too short":
      return "Write a few words so we know what you need.";
    case "message too long":
      return "Please keep it shorter.";
    case "network":
      return "We couldn't reach the service. Check your connection and try again.";
    default:
      return "Something went wrong and your message wasn't sent. Please try again.";
  }
}

export async function sendContact(scriptUrl: string, fields: ContactFields, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; text: string }> {
  const checked = checkContact(fields);
  if (!checked.ok) return { ok: false, text: checked.error };
  const reply = await post(scriptUrl, checked.body, fetchFn);
  return reply.ok ? { ok: true, text: messageForContact(null) } : { ok: false, text: messageForContact(reply.error) };
}

export interface ContactOptions {
  scriptUrl?: string;
  fetch?: typeof fetch;
}

export function mountContactForm(root: HTMLElement, options: ContactOptions): void {
  const message = el("textarea", { id: "contact-message", name: "message", rows: "5", maxlength: String(MAX_MESSAGE), required: "" });
  const replyTo = el("input", { id: "contact-reply", name: "reply_to", type: "text", autocomplete: "off", maxlength: "200" });
  // Hidden from people and from screen readers; a program that fills in every field gives itself away.
  const trap = el("input", { id: "contact-website", name: "website", type: "text", tabindex: "-1", autocomplete: "off" });
  const trapBox = el("div", { class: "trap", "aria-hidden": "true" }, el("label", { for: "contact-website" }, "Leave this empty"), trap);
  const submit = el("button", { type: "submit" }, "Send message");
  const status = el("div", { id: "contact-status", "aria-live": "polite" });
  const form = el(
    "form",
    { novalidate: "" },
    el("label", { for: "contact-message" }, "Your message"),
    message,
    el("label", { for: "contact-reply" }, "How can we reply? (optional)"),
    el("p", { class: "note" }, "An email address, or anything else you're happy to share. Leave it empty if you don't want a reply."),
    replyTo,
    trapBox,
    submit,
  );
  root.replaceChildren(form, status);
  if (!options.scriptUrl) {
    status.replaceChildren(el("p", { class: "note" }, "The contact form isn't switched on yet."));
    submit.disabled = true;
    return;
  }
  const scriptUrl = options.scriptUrl;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run();
  });
  async function run(): Promise<void> {
    submit.disabled = true;
    status.replaceChildren(el("p", { class: "note" }, "Sending…"));
    const result = await sendContact(scriptUrl, { message: message.value, replyTo: replyTo.value, website: trap.value }, options.fetch ?? fetch.bind(globalThis));
    submit.disabled = false;
    status.replaceChildren(el("p", { class: result.ok ? "" : "error", role: result.ok ? "status" : "alert" }, result.text));
    if (result.ok) {
      message.value = "";
      replyTo.value = "";
    }
  }
}
