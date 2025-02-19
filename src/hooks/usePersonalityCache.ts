import { useState, useCallback } from 'react';
import type { PersonalityAnalysis } from '@/lib/openai';

interface UsePersonalityCacheProps {
  username: string;
}

interface CacheState {
  data: PersonalityAnalysis | null;
  isLoading: boolean;
  error: string | null;
  isFresh: boolean;
  lastUpdated: Date | null;
}

export function usePersonalityCache({ username }: UsePersonalityCacheProps) {
  const [state, setState] = useState<CacheState>({
    data: null,
    isLoading: false,
    error: null,
    isFresh: false,
    lastUpdated: null
  });

  // Fetch cache data
  const fetchCache = useCallback(async () => {
    if (!username) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`/api/personality/${username}/cache`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch cache');
      }

      if (data.success && data.data) {
        setState({
          data: data.data,
          isLoading: false,
          error: null,
          isFresh: true,
          lastUpdated: new Date(data.metadata.timestamp)
        });
        return data.data;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isFresh: false
        }));
        return null;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cache',
        isFresh: false
      }));
      return null;
    }
  }, [username]);

  // Save to cache
  const saveToCache = useCallback(async (analysisData: PersonalityAnalysis) => {
    if (!username) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`/api/personality/${username}/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisData })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save to cache');
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        data: analysisData,
        isFresh: true,
        lastUpdated: new Date()
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to save to cache'
      }));
      return false;
    }
  }, [username]);

  // Invalidate cache
  const invalidateCache = useCallback(async () => {
    if (!username) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`/api/personality/${username}/cache`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to invalidate cache');
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        isFresh: false,
        data: null
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to invalidate cache'
      }));
      return false;
    }
  }, [username]);

  return {
    ...state,
    fetchCache,
    saveToCache,
    invalidateCache
  };
} 