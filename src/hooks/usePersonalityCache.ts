import { useState, useCallback } from 'react';
import type { PersonalityAnalysis } from '@/lib/openai/types';

interface UsePersonalityCacheProps {
  username: string;
}

// Extended interface for cached data that includes tuning parameters
interface CachedPersonalityData extends PersonalityAnalysis {
  traitModifiers?: { [key: string]: number };
  interestWeights?: { [key: string]: number };
  customInterests?: string[];
}

interface CacheState {
  data: CachedPersonalityData | null;
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
      
      // Handle 404 gracefully - it just means no cache exists yet
      if (response.status === 404) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isFresh: false,
          data: null,
          error: null
        }));
        return null;
      }
      
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
      // Get existing tuning parameters
      const traitModifiers = state.data?.traitModifiers || {};
      
      // Prepare final data with applied modifiers
      const finalData: CachedPersonalityData = {
        ...analysisData,
        // Apply trait modifiers to trait scores
        traits: analysisData.traits.map(trait => ({
          ...trait,
          score: Math.max(0, Math.min(10, trait.score + (traitModifiers[trait.name] || 0)))
        })),
        // Preserve tuning parameters
        traitModifiers,
        interestWeights: state.data?.interestWeights || {},
        customInterests: state.data?.customInterests || [],
        communicationStyle: {
          ...analysisData.communicationStyle,
          formality: state.data?.communicationStyle?.formality ?? analysisData.communicationStyle.formality,
          enthusiasm: state.data?.communicationStyle?.enthusiasm ?? analysisData.communicationStyle.enthusiasm,
          technicalLevel: state.data?.communicationStyle?.technicalLevel ?? analysisData.communicationStyle.technicalLevel,
          emojiUsage: state.data?.communicationStyle?.emojiUsage ?? analysisData.communicationStyle.emojiUsage,
          description: analysisData.communicationStyle.description
        },
        thoughtProcess: {
          initialApproach: state.data?.thoughtProcess?.initialApproach ?? analysisData.thoughtProcess.initialApproach,
          processingStyle: state.data?.thoughtProcess?.processingStyle ?? analysisData.thoughtProcess.processingStyle,
          expressionStyle: state.data?.thoughtProcess?.expressionStyle ?? analysisData.thoughtProcess.expressionStyle
        }
      };

      const response = await fetch(`/api/personality/${username}/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisData: finalData })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save to cache');
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        data: finalData,
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
  }, [username, state.data]);

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