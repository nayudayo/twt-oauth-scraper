import React from 'react';

interface TuningUpdateMessageProps {
  type: 'trait' | 'interest' | 'communication';
  name: string;
  value: string | boolean;
  timestamp?: string;
}

export const TuningUpdateMessage: React.FC<TuningUpdateMessageProps> = ({
  type,
  name,
  value,
  timestamp = new Date().toLocaleTimeString()
}) => {
  const getUpdateMessage = () => {
    switch (type) {
      case 'trait':
        return `Trait: ${name} ${value ? 'enabled' : 'disabled'}`;
      case 'interest':
        return `Interest: ${name} ${value ? 'enabled' : 'disabled'}`;
      case 'communication':
        return `Communication Style: ${name} set to ${value}`;
      default:
        return 'Personality tuning updated';
    }
  };

  return (
    <div className="flex justify-center my-2">
      <div className="px-3 py-1.5 bg-black/30 rounded-md border border-red-500/10 backdrop-blur-sm max-w-[80%] transform hover:scale-[1.02] transition-all duration-200">
        <div className="text-red-400/60 text-sm text-center italic">
          {getUpdateMessage()}
          <div className="text-red-500/30 text-[10px] mt-0.5 font-mono">{timestamp}</div>
        </div>
      </div>
    </div>
  );
}; 