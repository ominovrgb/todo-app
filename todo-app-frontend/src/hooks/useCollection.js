import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';

function preserveCollectionOrder(previous, incoming) {
  const remaining = new Map(incoming.map((item) => [item.id, item]));
  const ordered = [];
  for (const item of previous) {
    if (remaining.has(item.id)) {
      ordered.push(remaining.get(item.id));
      remaining.delete(item.id);
    }
  }
  // Keep surviving IDs in client order, using fresh data; append newly seen IDs.
  return [...ordered, ...remaining.values()];
}

function getErrorText(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? String(item)).join(', ');
  return error.response ? 'The request could not be completed. Please try again.' : 'Unable to reach the server. Check your connection and try again.';
}

// Each collection retains its own loading, mutation and feedback state across navigation.
export default function useCollection(resource) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const requestId = useRef(0);
  const mutationLock = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await api.listRecords(resource);
      if (id !== requestId.current) return;
      const incoming = Array.isArray(response.data) ? response.data : [];
      setItems((previous) => preserveCollectionOrder(previous, incoming));
      setHasLoaded(true);
    } catch (requestError) {
      if (id === requestId.current) setError(getErrorText(requestError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [resource]);

  useEffect(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const mutate = async (key, operation, message) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setPending(key);
    setNotice(null);
    // Ignore an older refresh that could replace data during this mutation.
    requestId.current += 1;
    setLoading(false);
    try {
      await operation();
      setNotice({ kind: 'success', text: message });
      await load({ silent: true });
      return true;
    } catch (requestError) {
      setNotice({ kind: 'error', text: getErrorText(requestError) });
      return false;
    } finally {
      mutationLock.current = false;
      setPending('');
    }
  };

  return { items, loading, hasLoaded, error, notice, pending, load, mutate, setNotice };
}
