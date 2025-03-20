import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import type { EngagementMetrics } from '@/hooks/useAnalytics';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  data: EngagementMetrics;
}

export function EngagementChart({ data }: Props) {
  // Sort tweets by engagement for better visualization
  const sortedTweets = [...data.byTweet].sort((a, b) => b.engagement - a.engagement);

  const chartData = {
    labels: sortedTweets.map((_, i) => `Tweet ${i + 1}`),
    datasets: [
      {
        label: 'Engagement',
        data: sortedTweets.map(tweet => tweet.engagement),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: 'Views',
        data: sortedTweets.map(tweet => tweet.views || 0),
        borderColor: 'rgb(251, 146, 60)',
        backgroundColor: 'rgba(251, 146, 60, 0.1)',
        fill: false,
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  };

  const barChartData = {
    labels: sortedTweets.map((_, i) => `Tweet ${i + 1}`),
    datasets: [
      {
        label: 'Engagement per View',
        data: sortedTweets.map(tweet => 
          tweet.views ? (tweet.engagement / tweet.views) * 100 : 0
        ),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgb(239, 68, 68)'
        }
      },
      title: {
        display: true,
        text: 'Engagement & Views by Tweet',
        color: 'rgb(239, 68, 68)'
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)'
        },
        title: {
          display: true,
          text: 'Engagement',
          color: 'rgb(239, 68, 68)'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        beginAtZero: true,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: 'rgb(251, 146, 60)'
        },
        title: {
          display: true,
          text: 'Views',
          color: 'rgb(251, 146, 60)'
        }
      },
      x: {
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)',
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgb(239, 68, 68)'
        }
      },
      title: {
        display: true,
        text: 'Engagement Rate per Tweet (%)',
        color: 'rgb(239, 68, 68)'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)',
          callback: function(tickValue: number | string) {
            const value = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue;
            return `${value.toFixed(1)}%`;
          }
        }
      },
      x: {
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)',
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };

  return (
    <div className="grid gap-6">
      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Line data={chartData} options={lineOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Total Engagement</p>
            <p className="text-red-500 text-2xl font-bold">{data.totalEngagement}</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Engagement Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.engagementRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Virality Score</p>
            <p className="text-red-500 text-2xl font-bold">
              {data.viralityScore.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Bar data={barChartData} options={barOptions} />
        </div>
      </div>
    </div>
  );
} 