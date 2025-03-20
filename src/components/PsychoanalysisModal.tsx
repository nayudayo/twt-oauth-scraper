'use client'

import React, { useRef, useEffect, useState } from 'react'
import { PersonalityAnalysis } from '@/lib/openai'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
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

export function PsychoanalysisModal({ isOpen, onClose, analysis }: PsychoanalysisModalProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartData, setChartData] = useState({
    labels: [
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
    ],
    datasets: [{
      label: 'Social Behavior Profile',
      data: Array(12).fill(0),
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
  });

  // Update chart data when analysis changes
  useEffect(() => {
    if (analysis?.socialBehaviorMetrics) {
      const metrics = {
        oversharer: analysis.socialBehaviorMetrics.oversharer ?? 0,
        replyGuy: analysis.socialBehaviorMetrics.replyGuy ?? 0,
        viralChaser: analysis.socialBehaviorMetrics.viralChaser ?? 0,
        threadMaker: analysis.socialBehaviorMetrics.threadMaker ?? 0,
        retweeter: analysis.socialBehaviorMetrics.retweeter ?? 0,
        hotTaker: analysis.socialBehaviorMetrics.hotTaker ?? 0,
        joker: analysis.socialBehaviorMetrics.joker ?? 0,
        debater: analysis.socialBehaviorMetrics.debater ?? 0,
        doomPoster: analysis.socialBehaviorMetrics.doomPoster ?? 0,
        earlyAdopter: analysis.socialBehaviorMetrics.earlyAdopter ?? 0,
        knowledgeDropper: analysis.socialBehaviorMetrics.knowledgeDropper ?? 0,
        hypeBeast: analysis.socialBehaviorMetrics.hypeBeast ?? 0
      };

      console.log('Updating chart with metrics:', metrics);
      
      setChartData(prevData => ({
        ...prevData,
        datasets: [{
          ...prevData.datasets[0],
          data: Object.values(metrics)
        }]
      }));
    }
  }, [analysis]);

  // Debug effect for monitoring updates
  useEffect(() => {
    if (isOpen) {
      console.log('Modal opened with analysis:', analysis);
      console.log('Current chart data:', chartData);
    }
  }, [isOpen, analysis, chartData]);

  if (!isOpen) return null

  // Add debugging logs
  console.log('Analysis data received:', analysis);
  console.log('Social behavior metrics:', analysis?.socialBehaviorMetrics);

  const handleShare = async () => {
    if (!chartRef.current) return;

    try {
      // Get chart dimensions
      const chartElement = chartRef.current;
      const { width, height } = chartElement.getBoundingClientRect();

      // Generate PNG with better quality
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

      // Download image
      const link = document.createElement('a');
      link.download = 'social-behavior-analysis.png';
      link.href = dataUrl;
      link.click();

      // Create Twitter share text
      const tweetText = `Check out my Twitter personality analysis:\n\n🔍 Social Behavior Profile\n📊 Engagement Patterns\n🤖 AI-Powered Analysis\n\nhttps://pushthebutton.ai @pushthebuttonlol`;
      
      // Open Twitter intent in new window
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank');
    } catch (error) {
      console.error('Error sharing chart:', error);
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
            size: 12,
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
            size: 10,
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
          family: "'Share Tech Mono', monospace"
        },
        bodyFont: {
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999999] p-4 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[800px] bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border relative p-4 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-red-500/20 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
            <h2 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">
              PSYCHOANALYSIS COMPLETE
            </h2>
          </div>
          
          {/* Close Button */}
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
          {/* Radar Chart */}
          <div 
            ref={chartRef}
            className="bg-black/95 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow"
          >
            <h3 className="text-red-500/90 font-medium mb-4 text-center">Social Behavior Analysis</h3>
            <div className="w-full max-w-[600px] mx-auto" style={{ height: '600px' }}>
              <Radar data={chartData} options={chartOptions} />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={handleShare}
              className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow flex items-center gap-2"
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
              Begin Interaction
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 