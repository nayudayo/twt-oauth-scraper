import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
  BarElement
} from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';
import type { VisibilityMetrics } from '@/hooks/useAnalytics';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  BarElement
);

interface Props {
  data: VisibilityMetrics;
}

export function VisibilityChart({ data }: Props) {
  // Sort tweets by total visibility metrics
  const sortedTweets = [...data.byTweet].sort((a, b) => {
    const aTotal = (a.retweets || 0) + (a.replies || 0) + (a.likes || 0) + (a.quotes || 0);
    const bTotal = (b.retweets || 0) + (b.replies || 0) + (b.likes || 0) + (b.quotes || 0);
    return bTotal - aTotal;
  });

  const stackedBarData = {
    labels: sortedTweets.map((_, i) => `Tweet ${i + 1}`),
    datasets: [
      {
        label: 'Retweets',
        data: sortedTweets.map(tweet => tweet.retweets || 0),
        backgroundColor: 'rgb(239, 68, 68)',
        stack: 'Stack 0',
      },
      {
        label: 'Replies',
        data: sortedTweets.map(tweet => tweet.replies || 0),
        backgroundColor: 'rgb(251, 146, 60)',
        stack: 'Stack 0',
      },
      {
        label: 'Likes',
        data: sortedTweets.map(tweet => tweet.likes || 0),
        backgroundColor: 'rgb(34, 197, 94)',
        stack: 'Stack 0',
      },
      {
        label: 'Quotes',
        data: sortedTweets.map(tweet => tweet.quotes || 0),
        backgroundColor: 'rgb(59, 130, 246)',
        stack: 'Stack 0',
      }
    ]
  };

  const radarData = {
    labels: ['Retweet Rate', 'Reply Rate', 'Like Rate', 'Quote Rate'],
    datasets: [{
      label: 'Visibility Metrics',
      data: [
        data.retweetRate,
        data.replyRate,
        data.likeRate,
        data.quoteRate
      ],
      backgroundColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: 'rgb(239, 68, 68)',
      pointBackgroundColor: 'rgb(239, 68, 68)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgb(239, 68, 68)'
    }]
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
        text: 'Interaction Distribution by Tweet',
        color: 'rgb(239, 68, 68)'
      }
    },
    scales: {
      y: {
        stacked: true,
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)'
        }
      },
      x: {
        stacked: true,
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

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgb(239, 68, 68)'
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        pointLabels: {
          color: 'rgb(239, 68, 68)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)'
        }
      }
    }
  };

  return (
    <div className="grid gap-6">
      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Bar data={stackedBarData} options={barOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Overall Engagement Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.engagementRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Retweet Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.retweetRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Quote Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.quoteRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Radar data={radarData} options={radarOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Reply Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.replyRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Like Rate</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.likeRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Total Engagement</p>
            <p className="text-red-500 text-2xl font-bold">
              {data.byTweet.reduce((sum, tweet) => sum + tweet.engagement, 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 