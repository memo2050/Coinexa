import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// One hook for every super admin endpoint: loading, error and a manual reload.
// The payload is part of the dependency key so changing a filter refetches.
export default function useAdminEndpoint(name, payload = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(payload);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await base44.functions.invoke(name, JSON.parse(key));
      if (response.data?.error) setError(response.data.error);
      else setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'This section could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [name, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}