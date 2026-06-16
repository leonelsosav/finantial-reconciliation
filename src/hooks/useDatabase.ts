import { useState, useCallback, useMemo } from 'react';
import { DatabaseService } from '../services/database.service';
import type { QueryOptions } from '../services/database.service';

export function useDatabase<T>(tableName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => new DatabaseService<T>(tableName), [tableName]);

  const fetchData = useCallback(async (options?: QueryOptions) => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.getAll(options);
      setData(result);
      return result;
    } catch (err: any) {
      setError(err.message || 'Error fetching data');
      return [];
    } finally {
      setLoading(false);
    }
  }, [service]);

  const createRecord = useCallback(async (payload: Partial<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.create(payload);
      return result;
    } catch (err: any) {
      setError(err.message || 'Error creating record');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [service]);

  const updateRecord = useCallback(async (id: string, payload: Partial<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.update(id, payload);
      return result;
    } catch (err: any) {
      setError(err.message || 'Error updating record');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [service]);

  const deleteRecord = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await service.delete(id);
    } catch (err: any) {
      setError(err.message || 'Error deleting record');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [service]);

  return {
    data,
    loading,
    error,
    fetchData,
    createRecord,
    updateRecord,
    deleteRecord,
    service // Expose raw service if needed for subscriptions
  };
}
