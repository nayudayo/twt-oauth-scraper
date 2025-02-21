import { useEffect, useState } from 'react';
import type { PersonalityAnalysis } from '@/lib/openai';

interface UserDetailsModalProps {
  username: string;
  onClose: () => void;
}

interface UserDetails {
  profile: {
    name: string | null;
    bio: string | null;
    imageUrl: string | null;
  };
  personality: PersonalityAnalysis | null;
}

export function UserDetailsModal({ username, onClose }: UserDetailsModalProps) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch personality cache
        const response = await fetch(`/api/personality/${username}/cache`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch user details');
        }

        setDetails({
          profile: {
            name: data.data?.name || username,
            bio: data.data?.bio || 'No bio available',
            imageUrl: data.data?.imageUrl || null
          },
          personality: data.data || null
        });
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load user details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [username]);

  const handleProfileClick = () => {
    window.open(`https://twitter.com/${username}`, '_blank');
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999999] p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Profile Card */}
      <div 
        className="w-full max-w-[320px] sm:max-w-md bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border relative p-4 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 sm:top-4 right-2 sm:right-4 text-red-500/70 hover:text-red-500/90 ancient-text text-lg sm:text-xl"
        >
          <span className="sr-only">Close</span>
          ×
        </button>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6 sm:py-8">
            <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-500/70 text-center py-6 sm:py-8 text-sm sm:text-base">
            {error}
          </div>
        ) : details ? (
          <div className="text-center">
            {/* Profile Picture */}
            <div className="mb-3 sm:mb-4 flex justify-center">
              <button
                onClick={handleProfileClick}
                className="group relative rounded-full transition-transform hover:scale-105"
                title="View Twitter Profile"
              >
                {details.profile.imageUrl ? (
                  <img 
                    src={details.profile.imageUrl} 
                    alt={details.profile.name || 'Profile'} 
                    className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-red-500/20 shadow-lg shadow-red-500/10 transition-all group-hover:border-red-500/40 group-hover:shadow-red-500/20"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-red-500/20 bg-red-500/5 flex items-center justify-center transition-all group-hover:border-red-500/40 group-hover:bg-red-500/10">
                    <span className="text-red-500/50 text-xl sm:text-2xl">
                      {username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-red-500/0 group-hover:bg-red-500/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    className="w-4 h-4 sm:w-6 sm:h-6 text-red-500/70"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
                    />
                  </svg>
                </div>
              </button>
            </div>

            {/* Name */}
            <h3 className="text-lg sm:text-xl font-bold text-red-500/90 mb-2">
              {details.profile.name || username}
            </h3>

            {/* Summary */}
            {details.personality?.summary && (
              <p className="text-red-500/70 text-xs sm:text-sm leading-relaxed">
                {details.personality.summary}
              </p>
            )}
          </div>
        ) : (
          <div className="text-red-500/70 text-center py-6 sm:py-8 text-sm sm:text-base">
            No data available
          </div>
        )}
      </div>
    </div>
  );
} 