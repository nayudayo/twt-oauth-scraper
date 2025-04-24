import React from 'react';

interface CompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tweetCount: number;
}

export const CompletionModal: React.FC<CompletionModalProps> = ({
  isOpen,
  onClose,
  tweetCount
}) => {
  if (!isOpen) return null;

  // Mobile Layout
  const mobileModal = (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 lg:hidden"
      onClick={onClose}
    >
      <div 
        className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 border-b border-red-500/20 pb-4 glow-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
            <h3 className="text-lg font-bold tracking-wider text-red-500/90 glow-text">OPERATION COMPLETE</h3>
          </div>
          <button
            onClick={onClose}
            className="text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow"
          >
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="text-red-400/90">
            <p className="uppercase tracking-wider mb-2 glow-text">Data Collection Summary:</p>
            <ul className="list-disc pl-5 space-y-1 text-red-300/80">
              <li className="hover-text-glow">{tweetCount} posts collected</li>
            </ul>
          </div>
        
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
            >
              Close Terminal
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Desktop Layout
  const desktopModal = (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm hidden lg:flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-black/40 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 border-b border-red-500/20 pb-4 glow-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
            <h3 className="text-lg font-bold tracking-wider text-red-500/90 glow-text">OPERATION COMPLETE</h3>
          </div>
          <button
            onClick={onClose}
            className="text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow"
          >
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="text-red-400/90">
            <p className="uppercase tracking-wider mb-2 glow-text">Data Collection Summary:</p>
            <ul className="list-disc pl-5 space-y-1 text-red-300/80">
              <li className="hover-text-glow">{tweetCount} posts collected</li>
            </ul>
          </div>
        
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
            >
              Close Terminal
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileModal}
      {desktopModal}
    </>
  );
}; 