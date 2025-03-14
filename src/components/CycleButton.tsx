import React from 'react';
import { CommunicationLevel } from '@/lib/openai';

interface CycleButtonProps {
  value: CommunicationLevel;
  onChange: (value: CommunicationLevel) => void;
  label: string;
  className?: string;
}

const getNextValue = (current: CommunicationLevel): CommunicationLevel => {
  const cycle: CommunicationLevel[] = ['low', 'medium', 'high'];
  const currentIndex = cycle.indexOf(current);
  return cycle[(currentIndex + 1) % cycle.length];
};

const getButtonStyle = (value: CommunicationLevel) => {
  switch (value) {
    case 'high':
      return 'bg-red-500/20 text-red-500/90 border-red-500/30 shadow-lg shadow-red-500/10';
    case 'medium':
      return 'bg-red-500/10 text-red-500/70 border-red-500/20 shadow-md shadow-red-500/5';
    case 'low':
      return 'bg-black/20 text-red-500/50 border-red-500/10 hover:bg-red-500/5 hover:border-red-500/20';
  }
};

export const CycleButton: React.FC<CycleButtonProps> = ({
  value,
  onChange,
  label,
  className = ''
}) => {
  // Capitalize the first letter of the value
  const displayValue = typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
  
  return (
    <div className={`flex w-full ${className}`}>
      <button
        onClick={() => onChange(getNextValue(value))}
        className={`flex-1 px-3 py-1.5 text-xs font-mono rounded border transition-all duration-300 ${getButtonStyle(value)}`}
      >
        {label} ({displayValue})
      </button>
    </div>
  );
}; 