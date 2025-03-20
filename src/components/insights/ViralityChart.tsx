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
  Filler,
  TooltipItem
} from 'chart.js';
import { Scatter, Bar } from 'react-chartjs-2';
import type { ViralityMetrics } from '@/hooks/useAnalytics';

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
  data: ViralityMetrics;
}

export function ViralityChart({ data }: Props) {
  // Sort tweets by virality score
  const sortedTweets = [...data.byTweet].sort((a, b) => {
    const aScore = ((a.retweets || 0) + (a.quotes || 0)) / ((a.likes || 0) + 1);
    const bScore = ((b.retweets || 0) + (b.quotes || 0)) / ((b.likes || 0) + 1);
    return bScore - aScore;
  });

  const scatterData = {
    datasets: [{
      label: 'Tweets',
      data: sortedTweets.map(tweet => ({
        x: tweet.likes || 0,
        y: (tweet.retweets || 0) + (tweet.quotes || 0),
      })),
      backgroundColor: 'rgba(239, 68, 68, 0.6)',
      borderColor: 'rgb(239, 68, 68)',
      pointRadius: 6,
      pointHoverRadius: 8,
    }]
  };

  const barChartData = {
    labels: sortedTweets.map((_, i) => `Tweet ${i + 1}`),
    datasets: [
      {
        label: 'Engagement Per Thousand Views',
        data: sortedTweets.map(tweet => {
          const views = tweet.views || 1;
          return (tweet.engagement / views) * 1000;
        }),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1
      }
    ]
  };

  const scatterOptions = {
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
        text: 'Likes vs Retweets+Quotes',
        color: 'rgb(239, 68, 68)'
      },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'scatter'>) => {
            return `Likes: ${context.parsed.x}, RT+Quotes: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)'
        },
        title: {
          display: true,
          text: 'Retweets + Quotes',
          color: 'rgb(239, 68, 68)'
        }
      },
      x: {
        beginAtZero: true,
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)'
        },
        title: {
          display: true,
          text: 'Likes',
          color: 'rgb(239, 68, 68)'
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
        text: 'Engagement Per Thousand Views (EPMV)',
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
          color: 'rgb(239, 68, 68)'
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
          <Scatter data={scatterData} options={scatterOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Amplification Score</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.amplificationScore * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Shareability Factor</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.shareabilityFactor * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Conversion Potential</p>
            <p className="text-red-500 text-2xl font-bold">
              {data.conversionPotential.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Bar data={barChartData} options={barOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">EPMV</p>
            <p className="text-red-500 text-2xl font-bold">
              {data.engagementPerThousandViews.toFixed(1)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Conversation Score</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.conversationScore * 100).toFixed(1)}%
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