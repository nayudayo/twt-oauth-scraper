import React from 'react';
import { PersonalityAnalysis } from '@/lib/openai/types';
import { PersonalityTuning } from '@/types/personality';
import { Spinner } from '../ui/spinner';
import ReactMarkdown from 'react-markdown';
import { formatTraitName, formatTraitExplanation, formatInterestName } from '@/utils/formatting';

interface AnalysisSummaryProps {
  analysis: PersonalityAnalysis | null;
  tuning: PersonalityTuning;
  isAnalyzing: boolean;
  analysisElapsedTime: string | null;
  showAnalysisPrompt: boolean;
  accumulatedTweetsCount: number;
  onAnalyze: () => void;
  containerClassName?: string;
  retryState?: {
    attempt: number;
    maxAttempts: number;
    missingFields: string[];
  } | null;
}

export const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  analysis,
  tuning,
  isAnalyzing,
  analysisElapsedTime,
  showAnalysisPrompt,
  accumulatedTweetsCount,
  onAnalyze,
  containerClassName = "",
  retryState
}) => {
  // Helper function to format retry message
  const getRetryMessage = () => {
    if (!retryState) return '';
    
    return `Retrying analysis for missing components (Attempt ${retryState.attempt}/${retryState.maxAttempts}): ${retryState.missingFields.join(', ')}`;
  };

  return (
    <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg relative touch-action-pan-y ${containerClassName}`}>
      {!analysis ? (
        <div className="text-center">
          {isAnalyzing && (
            <div className="mb-4 text-red-500/90 tracking-wider uppercase glow-text flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20" />
                <span>ANALYZING PERSONALITY</span>
                {analysisElapsedTime && (
                  <span className="text-red-500/70">[{analysisElapsedTime}]</span>
                )}
              </div>
              {retryState && (
                <div className="text-sm text-red-500/70 mt-2">
                  {getRetryMessage()}
                </div>
              )}
            </div>
          )}
          <p className="text-red-500/70 mb-4 glow-text">
            Ready to analyze {accumulatedTweetsCount} tweets for personality insights
          </p>
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow ${showAnalysisPrompt && !isAnalyzing ? 'pulse-action' : ''}`}
          >
            {isAnalyzing ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>ANALYZING</span>
              </div>
            ) : (
              'START ANALYSIS'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Section */}
          <div className="bg-black/20 text-left rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text">Summary</span>
            </h4>
            <div className="prose prose-red prose-invert max-w-none hover-text-glow">
              <ReactMarkdown>{analysis.summary}</ReactMarkdown>
            </div>
          </div>

          {/* Key Traits Section */}
          <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text text-base">Active Traits</span>
            </h4>
            <div className="space-y-6">
              {analysis.traits
                .filter(trait => tuning.traitModifiers[trait.name] > 0) // Only show enabled traits
                .map((trait: { name: string; score: number; explanation: string }, index: number) => (
                  <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                    <div className="flex justify-between mb-2 items-center">
                      <span className="text-red-400/90 tracking-wide text-[15px] capitalize font-bold">
                        {formatTraitName(trait.name)}
                      </span>
                    </div>
                    <div className="text-[14px] leading-relaxed text-red-300/80 prose prose-red prose-invert max-w-none hover-text-glow pl-2 border-l border-red-500/10">
                      <ReactMarkdown>{formatTraitExplanation(trait.explanation)}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              {analysis.traits.filter(trait => tuning.traitModifiers[trait.name] > 0).length === 0 && (
                <div className="text-red-400/60 text-sm italic text-center">
                  No active traits selected
                </div>
              )}
            </div>
          </div>

          {/* Interests Section */}
          <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text text-base">Active Interests</span>
            </h4>
            <div className="flex flex-wrap gap-2.5 font-bold">
              {analysis.interests
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
                  return !nonInterests.includes(interestName) && tuning.interestWeights[interestName] > 0;
                })
                .map((interest: string) => {
                  const [interestName] = interest.split(':').map(s => s.trim());
                  return (
                    <button 
                      key={interestName}
                      className="px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-md text-red-300/90 text-[14px] tracking-wide hover:bg-red-500/10 hover:border-red-500/30 transition-colors duration-200 hover-glow"
                    >
                      {formatInterestName(interestName)}
                    </button>
                  );
                })}
              {analysis.interests
                .filter(interest => {
                  const [interestName] = interest.split(':').map(s => s.trim());
                  return tuning.interestWeights[interestName] > 0;
                }).length === 0 && (
                <div className="text-red-400/60 text-sm italic text-center w-full">
                  No active interests selected
                </div>
              )}
            </div>
          </div>

          {/* Communication Style Section */}
          <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text text-base">Communication Style</span>
            </h4>
            <div className="prose prose-red prose-invert max-w-none hover-text-glow prose-p:text-red-300/90 prose-p:leading-relaxed prose-p:text-[15px] mb-6">
              <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
            </div>
            <div className="space-y-4 bg-black/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                  Formality: {analysis.communicationStyle.formality === 'high' ? 'Very formal and professional' : 
                             analysis.communicationStyle.formality === 'medium' ? 'Balanced formality' : 
                             'Casual and relaxed'}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                  Enthusiasm: {analysis.communicationStyle.enthusiasm === 'high' ? 'Very enthusiastic and energetic' :
                              analysis.communicationStyle.enthusiasm === 'medium' ? 'Balanced enthusiasm' :
                              'Reserved and measured'}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                  Technical Level: {analysis.communicationStyle.technicalLevel === 'high' ? 'Advanced technical language' :
                                  analysis.communicationStyle.technicalLevel === 'medium' ? 'Mix of technical and simple terms' :
                                  'Simple, everyday language'}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                  Emoji Usage: {analysis.communicationStyle.emojiUsage === 'high' ? 'Frequent emojis (3+)' :
                               analysis.communicationStyle.emojiUsage === 'medium' ? 'Occasional emojis (1-2)' :
                               'No emojis'}
                </span>
              </div>
            </div>
          </div>

          {/* Topics & Themes Section */}
          <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text text-base">Topics & Themes</span>
            </h4>
            <ul className="list-none space-y-3 bg-black/20 rounded-lg p-4">
              {analysis.topicsAndThemes
                .filter(topic => {
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
                  return !nonInterests.some(metric => topic.includes(metric));
                })
                .map((topic: string, i: number) => (
                  <li key={i} className="flex items-center gap-3 text-red-300/90 hover-text-glow group">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/30 group-hover:bg-red-500/50 transition-colors duration-200"></div>
                    <span className="text-[14px] leading-relaxed tracking-wide font-bold">
                      {topic ? topic.replace(/[*-]/g, '') : topic}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          {/* Emotional Tone Section */}
          <div className="bg-black/20 text-left rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
            <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
              <span className="ancient-text text-base">Emotional Tone</span>
            </h4>
            <div className="space-y-4 bg-black/20 rounded-lg p-4">
              {analysis.emotionalTone.split(' - ').map((section, index) => {
                const [title, content] = section.split(' involves ').length > 1 
                  ? section.split(' involves ')
                  : section.split(' shows ').length > 1
                  ? section.split(' shows ')
                  : section.split(' is ');
                
                return (
                  <div key={`tone-${index}`} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                    <div className="flex-1">
                      <span className="text-red-400/90 font-medium">{title}</span>
                      <p className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow mt-1">
                        {content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
