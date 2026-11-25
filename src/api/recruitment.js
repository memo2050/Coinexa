import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

// All recruitment data goes through the `recruitment` server function: the tables
// themselves are closed to the browser.
export async function recruitment(action, body = {}) {
  const response = await base44.functions.invoke('recruitment', { action, ...body });
  return response.data;
}

export const errorText = (error) =>
  error?.response?.data?.error || error?.data?.error || error?.message || 'Something went wrong. Please try again.';

// CV upload for the candidate portal (multipart; authorised by the portal link).
export async function uploadCv(token, file) {
  const form = new FormData();
  form.append('token', token);
  form.append('file', file);
  const response = await fetch(`${appParams.supabaseUrl}/functions/v1/recruitment`, {
    method: 'POST',
    headers: { apikey: appParams.supabaseAnonKey },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Upload failed.'), { data });
  return data;
}

export function downloadText(fileName, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
