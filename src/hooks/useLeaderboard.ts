import { useState, useCallback } from 'react';

interface LeaderboardEntry {
  username: string;
  referralCode: string;
  totalReferrals: number;
  lastUsed?: Date;
}

interface LeaderboardState {
  data: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useLeaderboard() {
  const [state, setState] = useState<LeaderboardState>({
    data: [],
    isLoading: false,
    error: null,
    lastUpdated: null
  });

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch('/api/leaderboard');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }

      if (data.success && data.data) {
        setState({
          data: data.data.map((entry: LeaderboardEntry) => ({
            ...entry,
            lastUsed: entry.lastUsed ? new Date(entry.lastUsed) : undefined
          })),
          isLoading: false,
          error: null,
          lastUpdated: new Date(data.metadata.timestamp)
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'No data available'
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch leaderboard'
      }));
    }
  }, []);

  return {
    ...state,
    fetchLeaderboard
  };
} 