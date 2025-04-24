'use client'

import React, { useRef, useEffect, useState } from 'react'
import { PersonalityAnalysis } from '@/lib/openai/types'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ChartData
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import { toPng } from 'html-to-image'

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

interface PsychoanalysisModalProps {
  isOpen: boolean
  onClose: () => void
  analysis?: PersonalityAnalysis | null
}

type RadarChartData = ChartData<'radar', number[], string>

const CHART_LABELS = [
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
] as const;

const DEFAULT_CHART_DATA: RadarChartData = {
  labels: Array.from(CHART_LABELS),
  datasets: [{
    label: 'Social Behavior Profile',
    data: Array(CHART_LABELS.length).fill(0),
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderColor: 'rgba(255, 0, 0, 0.7)',
    borderWidth: 2,
    pointBackgroundColor: 'rgba(255, 0, 0, 1)',
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: 'rgba(255, 0, 0, 1)',
    pointRadius: 4,
    pointHoverRadius: 6,
    fill: true
  }]
};

// Helper function to map metrics to chart labels
function mapMetricsToChartLabels(metrics: Record<string, number>, labels: readonly string[]): number[] {
  return labels.map(label => {
    // Normalize the label for comparison
    const normalizedLabel = label.toLowerCase().replace(/\s+/g, '');
    
    // Map each normalized label to its corresponding metric
    switch (normalizedLabel) {
      case 'oversharer':
        return metrics.oversharer || 0;
      case 'replyguy':
        return metrics.replyGuy || 0;
      case 'viralchaser':
        return metrics.viralChaser || 0;
      case 'threadmaker':
        return metrics.threadMaker || 0;
      case 'retweeter':
        return metrics.retweeter || 0;
      case 'hottakes':
        return metrics.hotTaker || 0;
      case 'joker':
        return metrics.joker || 0;
      case 'debater':
        return metrics.debater || 0;
      case 'doomposter':
        return metrics.doomPoster || 0;
      case 'earlyadopter':
        return metrics.earlyAdopter || 0;
      case 'knowledgedropper':
        return metrics.knowledgeDropper || 0;
      case 'hypebeast':
        return metrics.hypeBeast || 0;
      default:
        console.warn(`No metric found for label: ${label} (normalized: ${normalizedLabel})`);
        return 0;
    }
  });
}

export function PsychoanalysisModal({ isOpen, onClose, analysis }: PsychoanalysisModalProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartData, setChartData] = useState(DEFAULT_CHART_DATA)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setChartData(DEFAULT_CHART_DATA)
      setError(null)
    }
    setIsLoading(true)
  }, [isOpen])

  // Update chart data when analysis changes
  useEffect(() => {
    if (!analysis) {
      console.log('No analysis data provided');
      setIsLoading(false);
      return;
    }

    try {
      // Debug full analysis object
      console.log('Full analysis object:', analysis);
      console.log('Social behavior metrics:', analysis.socialBehaviorMetrics);

      // Extract metrics with default values
      const metrics = {
        oversharer: analysis.socialBehaviorMetrics?.oversharer ?? 0,
        replyGuy: analysis.socialBehaviorMetrics?.replyGuy ?? 0,
        viralChaser: analysis.socialBehaviorMetrics?.viralChaser ?? 0,
        threadMaker: analysis.socialBehaviorMetrics?.threadMaker ?? 0,
        retweeter: analysis.socialBehaviorMetrics?.retweeter ?? 0,
        hotTaker: analysis.socialBehaviorMetrics?.hotTaker ?? 0,
        joker: analysis.socialBehaviorMetrics?.joker ?? 0,
        debater: analysis.socialBehaviorMetrics?.debater ?? 0,
        doomPoster: analysis.socialBehaviorMetrics?.doomPoster ?? 0,
        earlyAdopter: analysis.socialBehaviorMetrics?.earlyAdopter ?? 0,
        knowledgeDropper: analysis.socialBehaviorMetrics?.knowledgeDropper ?? 0,
        hypeBeast: analysis.socialBehaviorMetrics?.hypeBeast ?? 0
      };

      console.log('Initial metrics from socialBehaviorMetrics:', metrics);

      // If all values are 0, try to extract from summary
      const hasNonZeroValues = Object.values(metrics).some(value => value > 0);
      if (!hasNonZeroValues && analysis.summary) {
        console.log('No values in socialBehaviorMetrics, attempting to extract from summary');
        
        // Function to extract score from text
        const extractScore = (text: string): number => {
          // Try different score formats
          const patterns = [
            /score[:\s]+(\d+)/i,              // "Score: 80" or "Score 80"
            /(\d+)(?:\/100|\s*%|\s*points?)/i, // "80/100" or "80%" or "80 points"
            /:\s*(\d+)/,                      // ": 80"
            /[-–]\s*(\d+)/,                   // "- 80" or "– 80"
            /(\d+)/                           // Just a number
          ];

          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              const score = parseInt(match[1], 10);
              if (score >= 0 && score <= 100) {
                return score;
              }
            }
          }
          return 0;
        };

        const lines = analysis.summary.split('\n');
        let inSocialBehaviorSection = false;

        lines.forEach(line => {
          const trimmedLine = line.trim().toLowerCase();
          
          // Check if we're in the Social Behavior Metrics section
          if (trimmedLine.includes('social behavior metrics')) {
            inSocialBehaviorSection = true;
            return;
          }

          if (!inSocialBehaviorSection || !trimmedLine) return;

          // Skip section headers
          if (trimmedLine.startsWith('###') || /^[a-z]\)/.test(trimmedLine)) {
            return;
          }

          // Clean up the line
          const cleanLine = trimmedLine.replace(/\*\*/g, '').replace(/[""]/g, '');

          Object.keys(metrics).forEach(metricKey => {
            const key = metricKey as keyof typeof metrics;
            const searchTerm = key.replace(/([A-Z])/g, ' $1').toLowerCase();
            
            if (cleanLine.includes(searchTerm)) {
              const score = extractScore(line);
              if (score > 0) {
                console.log(`Found score for ${key} in summary: ${score}`);
                metrics[key] = score;
              }
            }
          });
        });
      }

      console.log('Final metrics after extraction:', metrics);

      // Map metrics to chart labels
      const chartValues = mapMetricsToChartLabels(metrics, CHART_LABELS);
      console.log('Chart labels:', CHART_LABELS);
      console.log('Mapped chart values:', chartValues);

      // Update chart with mapped values
      setChartData(prevData => {
        const newData = {
          ...prevData,
          datasets: [{
            ...prevData.datasets[0],
            data: chartValues
          }]
        };
        console.log('Final chart data:', newData);
        return newData;
      });

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process analysis data';
      console.error('Error in chart data processing:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [analysis]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!chartRef.current) return;

    try {
      const chartElement = chartRef.current;
      const { width, height } = chartElement.getBoundingClientRect();

      const dataUrl = await toPng(chartElement, {
        quality: 1.0,
        width: width * 2,
        height: height * 2,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        style: {
          transform: 'scale(2)',
          transformOrigin: 'top left',
          width: `${width}px`,
          height: `${height}px`
        }
      });

      const link = document.createElement('a');
      link.download = 'social-behavior-analysis.png';
      link.href = dataUrl;
      link.click();

      const tweetText = `Check out my Twitter personality analysis:\n\n🔍 Social Behavior Profile\n📊 Engagement Patterns\n🤖 AI-Powered Analysis\n\nhttps://pushthebutton.ai @pushthebuttonlol`;
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank');
    } catch (error) {
      console.error('Error sharing chart:', error);
      setError('Failed to share analysis');
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 100,
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 0, 0, 0.2)',
          lineWidth: 1,
          circular: true
        },
        angleLines: {
          color: 'rgba(255, 0, 0, 0.2)',
          lineWidth: 1
        },
        pointLabels: {
          color: 'rgba(255, 0, 0, 0.8)',
          font: {
            size: windowWidth < 640 ? 8 : windowWidth < 768 ? 10 : 12,
            family: "'Share Tech Mono', monospace",
            weight: 'normal'
          }
        },
        ticks: {
          stepSize: 20,
          display: true,
          color: 'rgba(255, 0, 0, 0.6)',
          backdropColor: 'transparent',
          z: 1,
          font: {
            size: windowWidth < 640 ? 8 : windowWidth < 768 ? 9 : 10,
            family: "'Share Tech Mono', monospace"
          },
          callback: function(tickValue: number | string) {
            return typeof tickValue === 'number' ? tickValue.toString() : tickValue;
          }
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'rgba(255, 0, 0, 0.7)',
        bodyColor: '#fff',
        padding: 12,
        boxPadding: 6,
        titleFont: {
          size: windowWidth < 640 ? 10 : windowWidth < 768 ? 12 : 14,
          family: "'Share Tech Mono', monospace"
        },
        bodyFont: {
          size: windowWidth < 640 ? 9 : windowWidth < 768 ? 11 : 13,
          family: "'Share Tech Mono', monospace"
        },
        callbacks: {
          label: function(tooltipItem: { raw: unknown }) {
            const value = typeof tooltipItem.raw === 'number' ? tooltipItem.raw : 0;
            return `Score: ${value}/100`;
          }
        }
      }
    }
  } as const;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999999] p-2 sm:p-4 md:p-6"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[95%] sm:max-w-[90%] md:max-w-[800px] bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border relative p-2 sm:p-4 md:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-red-500/20 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-red-500/90 tracking-wider glow-text">
              PSYCHOANALYSIS {isLoading ? 'PROCESSING' : error ? 'ERROR' : 'COMPLETE'}
            </h2>
          </div>
          
          <button
            onClick={onClose}
            className="text-red-500/70 hover:text-red-500/90 ancient-text text-lg sm:text-xl"
          >
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Error State */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500/90">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center h-[600px] bg-black/95 rounded-lg">
              <div className="animate-pulse text-red-500/90">Processing Analysis...</div>
            </div>
          )}

          {/* Radar Chart */}
          {!isLoading && !error && (
            <div 
              ref={chartRef}
              className="bg-black/95 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow"
            >
              <h3 className="text-red-500/90 font-medium mb-4 text-center">Social Behavior Analysis</h3>
              <div className="w-full max-w-[600px] mx-auto" style={{ height: 'clamp(300px, 55vh, 600px)'}}>
                <Radar data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={handleShare}
              disabled={isLoading || !!error}
              className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share Analysis
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
            >
              {isLoading ? 'Cancel' : error ? 'Close' : 'Begin Interaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 