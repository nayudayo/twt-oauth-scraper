import React from 'react';
import { PersonalityAnalysis } from '@/lib/openai/types';
import { PersonalityTuning } from '@/types/personality';
import { ToggleButton } from '../ToggleButton';
import { CycleButton } from '../CycleButton';
import { CacheStatusIndicator } from '../CacheStatusIndicator';
import { CommunicationLevel } from '@/lib/openai/types';

interface FineTuningPanelProps {
  analysis: PersonalityAnalysis | null;
  tuning: PersonalityTuning;
  onTraitAdjustment: (traitName: string, enabled: boolean) => void;
  onInterestWeight: (interest: string, enabled: boolean) => void;
  onStyleAdjustment: (aspect: keyof PersonalityTuning['communicationStyle'], value: CommunicationLevel) => void;
  isCacheFresh: boolean;
  lastCacheUpdate: Date | null;
  isCacheLoading: boolean;
  onRefreshCache: () => void;
  containerClassName?: string;
  variant?: 'mobile' | 'desktop';
}

export const FineTuningPanel: React.FC<FineTuningPanelProps> = ({
  analysis,
  tuning,
  onTraitAdjustment,
  onInterestWeight,
  onStyleAdjustment,
  isCacheFresh,
  lastCacheUpdate,
  isCacheLoading,
  onRefreshCache,
  containerClassName = "",
  variant = 'mobile'
}) => {
  const isDesktop = variant === 'desktop';
  
  const containerStyles = isDesktop
    ? "w-full flex-1 bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern overflow-hidden min-h-0"
    : "w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern mb-4 sm:mb-6 md:mb-8";

  const contentStyles = isDesktop
    ? "flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg"
    : `flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg ${containerClassName}`;

  return (
    <div className={containerStyles}>
      <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
            <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY FINE-TUNING</h3>
          </div>
          {analysis && onRefreshCache && (
            <CacheStatusIndicator
              isFresh={isCacheFresh}
              lastUpdated={lastCacheUpdate}
              isLoading={isCacheLoading}
              onRefresh={onRefreshCache}
              className="ml-4"
            />
          )}
        </div>
      </div>

      <div className={contentStyles}>
        {analysis ? (
          <div className="space-y-6">
            {/* Personality Traits */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                <span className="glow-text">Key Traits</span>
              </h4>
              <div className="space-y-4">
                {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => {
                  return (
                    <div key={`trait-${index}-${trait.name}`} className="space-y-2 hover-glow">
                      <ToggleButton
                        value={Boolean(tuning.traitModifiers[trait.name] ?? Math.round(trait.score * 10))}
                        onChange={(enabled) => onTraitAdjustment(trait.name, enabled)}
                        label={trait.name}
                        className="w-full"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interests Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <span className="glow-text">Interests</span>
              </h4>
              <div className="space-y-3">
                {analysis?.interests
                  .filter(interest => {
                    // Filter out social behavior metrics and other non-interest items
                    const nonInterests = [
                      'Content Sharing Patterns',
                      'Score',
                      'Interaction Style',
                      'Platform Behavior',
                      'Oversharer',
                      'Reply Guy',
                      'Viral Chaser',
                      'Thread Maker',
                      'Retweeter',
                      'Hot Takes',
                      'Joker',
                      'Debater',
                      'Doom Poster',
                      'Early Adopter',
                      'Knowledge Dropper',
                      'Hype Beast'
                    ];
                    const [interestName] = interest.split(':').map(s => s.trim());
                    return !nonInterests.includes(interestName);
                  })
                  .map((interest: string, index: number) => {
                    const [interestName] = interest.split(':').map(s => s.trim());
                    return (
                      <div key={`interest-${index}-${interestName}`} className="space-y-1">
                        <ToggleButton
                          value={Boolean(tuning.interestWeights[interestName] || 0)}
                          onChange={(enabled) => onInterestWeight(interestName, enabled)}
                          label={interestName}
                          className={`w-full ${tuning.interestWeights[interestName] === 0 ? 'opacity-50' : ''}`}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Communication Style */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <span className="glow-text">Communication Style</span>
              </h4>
              <div className="space-y-3">
                <div className="space-y-1 hover-glow">
                  <CycleButton
                    value={tuning.communicationStyle.formality}
                    onChange={(value) => onStyleAdjustment('formality', value)}
                    label="Formality"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1 hover-glow">
                  <CycleButton
                    value={tuning.communicationStyle.technicalLevel}
                    onChange={(value) => onStyleAdjustment('technicalLevel', value)}
                    label="Technical Level"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1 hover-glow">
                  <CycleButton
                    value={tuning.communicationStyle.enthusiasm}
                    onChange={(value) => onStyleAdjustment('enthusiasm', value)}
                    label="Enthusiasm"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1 hover-glow">
                  <CycleButton
                    value={tuning.communicationStyle.emojiUsage}
                    onChange={(value) => onStyleAdjustment('emojiUsage', value)}
                    label="Emoji Usage"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1 hover-glow">
                  <CycleButton
                    value={tuning.communicationStyle.verbosity}
                    onChange={(value) => onStyleAdjustment('verbosity', value)}
                    label="Verbosity"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-red-500/70 italic text-center glow-text">
            Run personality analysis to enable fine-tuning
          </div>
        )}
      </div>
    </div>
  );
};
