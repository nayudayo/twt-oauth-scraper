import React from 'react';

interface ConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorize: () => void;
  loading?: boolean;
  onCancelScraping?: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  onClose,
  onAuthorize,
  loading,
  onCancelScraping
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = () => {
    onClose();
    if (loading && onCancelScraping) onCancelScraping();
  };

  // Mobile Layout
  const mobileModal = (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 lg:hidden"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
          <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">
            SYSTEM AUTHORIZATION REQUIRED
          </h3>
        </div>
        <div className="space-y-4 text-red-400/90">
          <p className="uppercase tracking-wider glow-text">
            This operation will collect the following data:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-red-300/80">
            <li className="hover-text-glow">Profile metrics and identifiers</li>
            <li className="hover-text-glow">Recent transmission logs</li>
            <li className="hover-text-glow">Associated media content</li>
          </ul>
          <p className="text-red-300/80 hover-text-glow">
            Estimated operation time: 1-2 minutes. Maintain connection stability during the process.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
          >
            Abort
          </button>
          <button
            onClick={onAuthorize}
            className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
          >
            Authorize
          </button>
        </div>
      </div>
    </div>
  );

  // Desktop Layout
  const desktopModal = (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm hidden lg:flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
          <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">
            SYSTEM AUTHORIZATION REQUIRED
          </h3>
        </div>
        <div className="space-y-4 text-red-400/90">
          <p className="uppercase tracking-wider glow-text">
            This operation will collect the following data:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-red-300/80">
            <li className="hover-text-glow">Profile metrics and identifiers</li>
            <li className="hover-text-glow">Recent transmission logs</li>
            <li className="hover-text-glow">Associated media content</li>
          </ul>
          <p className="text-red-300/80 hover-text-glow">
            Estimated operation time: 1-2 minutes. Maintain connection stability during the process.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
          >
            Abort
          </button>
          <button
            onClick={onAuthorize}
            className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
          >
            Authorize
          </button>
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