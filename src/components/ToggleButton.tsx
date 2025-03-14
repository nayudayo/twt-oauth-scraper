import React from 'react';

interface ToggleButtonProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  className?: string;
  onRemove?: () => void;
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({
  value,
  onChange,
  label,
  className = '',
  onRemove
}) => {
  return (
    <div className={`flex w-full ${className}`}>
      <button
        onClick={() => onChange(!value)}
        className={`flex-1 px-3 py-1.5 text-xs font-mono rounded-l border transition-all duration-300 ${
          value
            ? 'bg-red-500/20 text-red-500/90 border-red-500/30 shadow-lg shadow-red-500/10'
            : 'bg-black/20 text-red-500/50 border-red-500/10 hover:bg-red-500/5 hover:border-red-500/20'
        }`}
      >
        {label}
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          className={`w-8 flex items-center justify-center rounded-r border-t border-r border-b transition-all duration-300 ${
            value
              ? 'bg-red-500/20 text-red-500/90 border-red-500/30 hover:bg-red-500/30'
              : 'bg-black/20 text-red-500/50 border-red-500/10 hover:bg-red-500/10'
          }`}
        >
          <span className="text-sm">×</span>
        </button>
      )}
    </div>
  );
}; 