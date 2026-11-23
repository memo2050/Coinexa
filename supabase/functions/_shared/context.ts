// Per-request context (which function is running, who called it). Lets the AI
// adapter attribute spend without changing every call site.
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = { fn: string; userId: string | null; organizationId: string | null };

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentContext = (): RequestContext =>
  requestContext.getStore() || { fn: 'unknown', userId: null, organizationId: null };
