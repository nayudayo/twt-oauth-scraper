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
      // Get existing tuning parameters
      const traitModifiers = state.data?.traitModifiers !== undefined ? state.data.traitModifiers : {};
      
      // Prepare final data with applied modifiers
      const finalData: PersonalityAnalysis = {
        ...analysisData,
        // Apply trait modifiers to trait scores
        traits: analysisData.traits.map(trait => ({
          ...trait,
          score: Math.max(0, Math.min(10, trait.score + (traitModifiers[trait.name] || 0)))
        })),
        // Preserve tuning parameters
        traitModifiers,
        interestWeights: state.data?.interestWeights !== undefined ? state.data.interestWeights : {},
        customInterests: state.data?.customInterests !== undefined ? state.data.customInterests : [],
        communicationStyle: {
          ...analysisData.communicationStyle,
          // Preserve existing numeric values if they exist, otherwise use new values
          formality: state.data?.communicationStyle?.formality ?? analysisData.communicationStyle.formality,
          enthusiasm: state.data?.communicationStyle?.enthusiasm ?? analysisData.communicationStyle.enthusiasm,
          technicalLevel: state.data?.communicationStyle?.technicalLevel ?? analysisData.communicationStyle.technicalLevel,
          emojiUsage: state.data?.communicationStyle?.emojiUsage ?? analysisData.communicationStyle.emojiUsage,
          description: analysisData.communicationStyle.description
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