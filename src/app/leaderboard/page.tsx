'use client'

import { useEffect, useState } from 'react';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useSession } from 'next-auth/react';
import { UserDetailsModal } from '@/components/UserDetailsModal';

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const { data, isLoading, error, lastUpdated, fetchLeaderboard } = useLeaderboard();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Initial load and auto-refresh setup
  useEffect(() => {
    if (session?.username) {
      fetchLeaderboard();

      // Set up auto-refresh every 5 minutes if enabled
      let refreshInterval: NodeJS.Timeout;
      if (autoRefresh) {
        refreshInterval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
      }

      return () => {
        if (refreshInterval) {
          clearInterval(refreshInterval);
        }
      };
    }
  }, [session?.username, fetchLeaderboard, autoRefresh]);

  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500/70">Please sign in to view leaderboards</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono p-2 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold text-red-500/90 tracking-wider mb-2 text-center">NEURAL NETWORK LEADERBOARD</h1>
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Auto-refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="text-red-500/70 hover:text-red-500/90 text-xs sm:text-sm flex items-center gap-1"
                title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  className={`w-3 h-3 sm:w-4 sm:h-4 ${autoRefresh ? 'text-red-500/90' : 'text-red-500/50'}`}
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
                {autoRefresh ? 'ON' : 'OFF'}
              </button>
              
              {/* Manual Refresh Button */}
              <button
                onClick={() => fetchLeaderboard()}
                disabled={isLoading}
                className="px-2 sm:px-4 py-1 sm:py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </div>
            <div className="text-red-500/50 text-[10px] sm:text-sm text-center">
              Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never'}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-6 sm:py-12">
            <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-red-500/70 text-center py-4 sm:py-8 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {/* Data Table */}
        {!isLoading && !error && data.length > 0 && (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full border-collapse min-w-full table-fixed">
              <thead>
                <tr className="border-b border-red-500/20">
                  <th className="w-[8%] px-2 sm:px-4 py-3 text-left text-red-500/70 font-normal text-[11px] sm:text-sm">#</th>
                  <th className="w-[22%] px-2 sm:px-4 py-3 text-left text-red-500/70 font-normal text-[11px] sm:text-sm">Username</th>
                  <th className="w-[35%] px-2 sm:px-4 py-3 text-left text-red-500/70 font-normal text-[11px] sm:text-sm">Referral Code</th>
                  <th className="w-[15%] px-2 sm:px-4 py-3 text-right text-red-500/70 font-normal text-[11px] sm:text-sm">Total</th>
                  <th className="w-[20%] px-2 sm:px-4 py-3 text-right text-red-500/70 font-normal text-[11px] sm:text-sm">Last Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-500/10">
                {data.map((entry, index) => (
                  <tr 
                    key={entry.referralCode}
                    className="hover:bg-red-500/5 transition-colors"
                  >
                    <td className="px-2 sm:px-4 py-3 text-red-500/50 text-[11px] sm:text-sm whitespace-nowrap">{index + 1}</td>
                    <td className="px-2 sm:px-4 py-3">
                      <button
                        onClick={() => setSelectedUser(entry.username)}
                        className="text-red-500/90 hover:text-red-500 transition-colors text-[11px] sm:text-sm truncate max-w-full block"
                      >
                        {entry.username}
                      </button>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-red-500/70 font-mono text-[11px] sm:text-sm truncate">{entry.referralCode}</td>
                    <td className="px-2 sm:px-4 py-3 text-right text-red-500/90 text-[11px] sm:text-sm whitespace-nowrap">{entry.totalReferrals}</td>
                    <td className="px-2 sm:px-4 py-3 text-right text-red-500/50 text-[11px] sm:text-sm whitespace-nowrap">
                      {entry.lastUsed ? (
                        <>
                          <span className="sm:hidden">
                            {new Date(entry.lastUsed).toLocaleDateString(undefined, { 
                              month: 'numeric', 
                              day: 'numeric'
                            })}
                          </span>
                          <span className="hidden sm:inline">
                            {new Date(entry.lastUsed).toLocaleDateString()}
                          </span>
                        </>
                      ) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && data.length === 0 && (
          <div className="text-red-500/50 text-center py-6 sm:py-12 text-xs sm:text-base">
            No leaderboard data available
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal
          username={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </main>
  );
} 