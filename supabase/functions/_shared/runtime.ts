// Replacement for Base44's `base44:runtime` module. Secrets are Supabase Edge
// Function secrets (set in the Supabase dashboard), read from the environment.
const ALIASES: Record<string, string> = {
  // The Stripe metadata field kept its Base44 name; the value is our own app id.
  BASE44_APP_ID: 'APP_ID',
};

export const secrets = {
  get(name: string): string | undefined {
    return Deno.env.get(name) ?? (ALIASES[name] ? Deno.env.get(ALIASES[name]) : undefined);
  },
};
