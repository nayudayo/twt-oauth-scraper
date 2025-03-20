'use client';

import { useEffect, useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useSession } from 'next-auth/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calculator } from 'lucide-react';
import { EngagementChart } from '@/components/insights/EngagementChart';
import { QualityChart } from '@/components/insights/QualityChart';
import { VisibilityChart } from '@/components/insights/VisibilityChart';
import { ViralityChart } from '@/components/insights/ViralityChart';

export default function InsightsPage() {
  const { data: session, status } = useSession();
  const username = session?.username;
  const [refresh, setRefresh] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch
  } = useAnalytics(username || '', { refresh });

  useEffect(() => {
    if (refresh) {
      refetch();
      setRefresh(false);
    }
  }, [refresh, refetch]);

  const handleCalculate = async () => {
    if (!username) return;
    
    setIsCalculating(true);
    try {
      const response = await fetch(`/api/analytics?username=${username}&refresh=true`);
      if (!response.ok) {
        throw new Error('Failed to calculate analytics');
      }
      await refetch();
    } catch (error) {
      console.error('Error calculating analytics:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // Show loading state while session is loading
  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold text-red-500">Loading...</h1>
      </div>
    );
  }

  if (!username) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold text-red-500">Please sign in to view insights</h1>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold text-red-500">Error loading insights</h1>
        <p className="text-red-400 mt-2">{error instanceof Error ? error.message : 'Unknown error'}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => refetch()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-red-500">Analytics Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCalculate}
            disabled={isCalculating || isLoading}
            className="flex items-center gap-2"
          >
            <Calculator className={`h-4 w-4 ${isCalculating ? 'animate-pulse' : ''}`} />
            Calculate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefresh(true)}
            disabled={isLoading || isCalculating}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {(isLoading || isCalculating) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-6 rounded-lg border border-red-500/20 bg-black/40">
              <Skeleton className="h-48 w-full bg-red-500/10" />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {analytics && !isLoading && !isCalculating && (
        <div className="space-y-8">
          {/* Engagement Section */}
          {analytics.engagement && (
            <section>
              <h2 className="text-xl font-semibold text-red-500 mb-4">Engagement Analytics</h2>
              <EngagementChart data={analytics.engagement} />
            </section>
          )}

          {/* Quality & Visibility Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {analytics.quality && (
              <section>
                <h2 className="text-xl font-semibold text-red-500 mb-4">Quality Metrics</h2>
                <QualityChart data={analytics.quality} />
              </section>
            )}
            {analytics.visibility && (
              <section>
                <h2 className="text-xl font-semibold text-red-500 mb-4">Visibility Metrics</h2>
                <VisibilityChart data={analytics.visibility} />
              </section>
            )}
          </div>

          {/* Virality Section */}
          {analytics.virality && (
            <section>
              <h2 className="text-xl font-semibold text-red-500 mb-4">Virality Analytics</h2>
              <ViralityChart data={analytics.virality} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
