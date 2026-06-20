// Returns an error string if the message is rejected, null if it passes.

// Block HTML tags and javascript: URIs — the two real injection vectors.
const HTML_RE = /<[a-zA-Z\/!]/;
const JSURI_RE = /javascript\s*:/i;

// Common profanity and slurs, word-boundary matched so substrings don't trigger
// (e.g. "assassin", "cockney", "classic" are all fine).
const OFFENSIVE_RE =
  /\b(fuck(?:ing|er|ed|s|ers)?|sh[i1]t(?:ty|ter|s)?|c[u*]nts?|b[i1]tch(?:es|ing)?|bastards?|fag(?:got)?s?|n[i1]gg[ae]r?s?|ch[i1]nks?|sp[i1]cs?|k[i1]kes?|gooks?|retards?|wh[o0]res?|sl[u*]ts?|tw[a@]ts?|d[i1]cks?|c[o0]cks?(?!ney)|a[s$][s$]h[o0]les?)\b/i;

export function moderateChat(message: string): string | null {
  if (HTML_RE.test(message)) {
    return 'Messages may not contain HTML or markup.';
  }
  if (JSURI_RE.test(message)) {
    return 'Message contains disallowed content.';
  }
  if (OFFENSIVE_RE.test(message)) {
    return 'Message contains disallowed language.';
  }
  return null;
}
