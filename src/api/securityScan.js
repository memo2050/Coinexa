import { base44 } from '@/api/base44Client';

// All security-scan data goes through the `securityScan` server function: the tables
// themselves are closed to the browser.
export async function securityScan(action, body = {}) {
  const response = await base44.functions.invoke('securityScan', { action, ...body });
  return response.data;
}

export { errorText } from '@/api/recruitment';
