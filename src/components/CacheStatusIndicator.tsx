interface CacheStatusIndicatorProps {
  isFresh: boolean;
  lastUpdated: Date | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function CacheStatusIndicator({
  isFresh,
  lastUpdated,
  isLoading = false,
  onRefresh,
  className = ''
}: CacheStatusIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      {/* Status Indicator */}
      <div className="flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${
          isLoading ? 'bg-red-500 animate-pulse' :
          isFresh ? 'bg-red-500/70' : 'bg-red-500/30'
        } shadow-lg shadow-red-500/20`} />
        <span className="text-red-500/70 tracking-wider uppercase">
          {isLoading ? 'Loading Cache' :
           isFresh ? 'Cache Fresh' : 'Cache Stale'}
        </span>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <>
          <div className="w-1 h-1 rounded-full bg-red-500/20" />
          <span className="text-red-500/50">
            Updated {lastUpdated.toLocaleString()}
          </span>
        </>
      )}

      {/* Refresh Button */}
      {onRefresh && !isLoading && (
        <button
          onClick={onRefresh}
          className="ml-2 text-red-500/70 hover:text-red-500/90 transition-colors"
          title="Refresh Cache"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            className="w-4 h-4"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
        </button>
      )}
    </div>
  );
} 