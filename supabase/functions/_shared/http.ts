// Wraps an unchanged Base44 function handler (`export default async function (req)`)
// for Supabase Edge Functions: CORS for the browser, a request context, the app URL
// header the checkout function expects, and a JSON error instead of a crash page.
import { requestContext } from './context.ts';

const allowedOrigins = () =>
  (Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('APP_URL') || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get('origin') || '').replace(/\/$/, '');
  const allowed = allowedOrigins();
  const allowOrigin = !allowed.length ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function serveBase44(name: string, handler: (req: Request) => Promise<Response> | Response) {
  Deno.serve(async (incoming: Request) => {
    const cors = corsHeaders(incoming);
    if (incoming.method === 'OPTIONS') return new Response('ok', { headers: cors });

    // checkout builds return URLs from this header; it is set here from the
    // configured APP_URL and never taken from the caller.
    const headers = new Headers(incoming.headers);
    headers.delete('X-Base44-App-Url');
    const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
    if (appUrl) headers.set('X-Base44-App-Url', appUrl);
    const req = new Request(incoming, { headers });

    let response: Response;
    try {
      response = await requestContext.run({ fn: name, userId: null, organizationId: null }, () => handler(req));
    } catch (error) {
      console.error(`${name}: unhandled error`, (error as Error)?.message);
      const status = Number((error as { status?: number })?.status) || 500;
      response = Response.json({ error: status === 500 ? 'Something went wrong. Please try again.' : (error as Error).message }, { status });
    }
    const out = new Response(response.body, response);
    for (const [key, value] of Object.entries(cors)) out.headers.set(key, value);
    return out;
  });
}
