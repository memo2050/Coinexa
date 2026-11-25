// Stripe setup for agent hires, shared by the test (staging) and live (production) workflows.
// STRIPE_MODE=test|live; the key must match the mode and every object Stripe returns is
// checked to be in that mode. Reads agent_plans from SUPABASE_PROJECT_REF (service key in
// /tmp/keys.json), creates missing monthly prices (lookup coinexa_agent_<key>_v1), the
// customer portal settings and the webhook endpoint, and writes /tmp/stripe.env with the
// function secrets to set. Idempotent: existing objects are reused.
const key = process.env.STRIPE_SECRET_KEY;
const MODE = process.env.STRIPE_MODE === "live" ? "live" : "test";
const KEY_OK = MODE === "live" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
if (!KEY_OK.test(key || "")) throw new Error(`A Stripe ${MODE.toUpperCase()} key is required for ${MODE} setup.`);
const wrongMode = (obj) => obj.livemode !== (MODE === "live");
const api = async (method, path, params) => {
  const body = params ? new URLSearchParams(params) : undefined;
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.error?.message}`); return j;
};
const plans = [
  { lookup: "coinexa_agent_sprint", name: "Agent Sprint", amount: 2500, env: "STRIPE_PRICE_AGENT_SPRINT" },
  { lookup: "coinexa_studio_retainer", name: "Studio Retainer", amount: 5000, env: "STRIPE_PRICE_STUDIO_RETAINER" },
];
// Individual agent plans: one product + monthly price per catalog plan, read from
// the staging database (prices are never typed twice).
const keys = JSON.parse((await import("node:fs")).readFileSync("/tmp/keys.json", "utf8"));
const serviceKey = (keys.find((x) => ["service_role", "secret"].includes(x.name)) || keys.find((x) => ["service_role", "secret"].includes(x.type)) || {}).api_key;
const rest = await fetch(`https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/rest/v1/agent_plans?select=key,name,price_cents,currency&active=eq.true`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
const agentPlans = await rest.json();
if (!Array.isArray(agentPlans) || !agentPlans.length) throw new Error("agent_plans could not be read");
for (const p of agentPlans) {
  const lookup = `coinexa_agent_${p.key}_v1`;
  const found = await api("GET", `/prices?lookup_keys[]=${lookup}&active=true`);
  let price = found.data[0];
  if (price && price.unit_amount !== p.price_cents) {
    await api("POST", `/prices/${price.id}`, { active: "false" });
    price = null;
  }
  if (!price) {
    const product = await api("POST", "/products", { name: `Coinexa agent: ${p.name}`, "metadata[plan_key]": p.key });
    price = await api("POST", "/prices", { product: product.id, unit_amount: String(p.price_cents), currency: p.currency || "usd", "recurring[interval]": "month", lookup_key: lookup, transfer_lookup_key: "true", "metadata[plan_key]": p.key });
    console.log(`created ${MODE} price ${lookup} ($${p.price_cents / 100}/month)`);
  }
  if (wrongMode(price)) throw new Error(`Price is not in ${MODE} mode; aborting.`);
}
console.log(`${agentPlans.length} agent plan prices ready`);
const out = [];
for (const p of plans) {
  const found = await api("GET", `/prices?lookup_keys[]=${p.lookup}&active=true`);
  let price = found.data[0];
  if (!price) {
    const product = await api("POST", "/products", { name: `Coinexa ${p.name}` });
    price = await api("POST", "/prices", { product: product.id, unit_amount: String(p.amount), currency: "usd", "recurring[interval]": "month", lookup_key: p.lookup });
    console.log(`created ${MODE} price ${p.lookup}`);
  }
  if (wrongMode(price)) throw new Error(`Price is not in ${MODE} mode; aborting.`);
  out.push(`${p.env}=${price.id}`);
}
// Customer billing portal for agent hires: card update, billing details, invoices.
// No cancelling there (each agent is cancelled from its own card in Coinexa).
const portals = await api("GET", "/billing_portal/configurations?limit=20");
if (!portals.data.some((c) => c.metadata?.coinexa === "agent_hires")) {
  const site = process.env.SITE_URL || `https://${process.env.STAGING_HOST}`;
  const pc = await api("POST", "/billing_portal/configurations", {
    "business_profile[headline]": "Coinexa: manage your agent subscription",
    "business_profile[privacy_policy_url]": `${site}/privacy`, "business_profile[terms_of_service_url]": `${site}/terms`,
    "features[payment_method_update][enabled]": "true", "features[invoice_history][enabled]": "true",
    "features[customer_update][enabled]": "true", "features[customer_update][allowed_updates][0]": "email", "features[customer_update][allowed_updates][1]": "address", "features[customer_update][allowed_updates][2]": "tax_id",
    "features[subscription_cancel][enabled]": "false", "metadata[coinexa]": "agent_hires" });
  if (wrongMode(pc)) throw new Error(`Portal is not in ${MODE} mode; aborting.`);
  console.log(`created ${MODE} customer portal settings`);
} else console.log("customer portal settings already exist");
const url = `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/stripeWebhook`;
const hooks = await api("GET", "/webhook_endpoints?limit=100");
const existing = hooks.data.filter((h) => h.url === url);
const events = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded", "charge.dispute.created"];
if (existing.length && process.env.RECREATE !== "true") {
  const params = new URLSearchParams();
  events.forEach((e) => params.append("enabled_events[]", e));
  const r = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${existing[0].id}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  if (!r.ok) throw new Error((await r.json()).error?.message);
  console.log("Webhook endpoint already exists; events updated, secret unchanged.");
} else {
  for (const h of existing) await api("DELETE", `/webhook_endpoints/${h.id}`);
  const params = new URLSearchParams({ url, description: `Coinexa ${process.env.SITE_LABEL || "staging"}` });
  events.forEach((e) => params.append("enabled_events[]", e));
  const r = await fetch("https://api.stripe.com/v1/webhook_endpoints", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const hook = await r.json(); if (!r.ok) throw new Error(hook.error?.message);
  if (wrongMode(hook)) throw new Error(`Webhook is not in ${MODE} mode; aborting.`);
  out.push(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
  console.log(`created ${MODE} webhook endpoint`);
}
(await import("node:fs")).writeFileSync("/tmp/stripe.env", out.join("\n") + "\n");
