import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';
import type { QualityMetrics } from '@/hooks/useAnalytics';

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

interface Props {
  data: QualityMetrics;
}

export function QualityChart({ data }: Props) {
  const radarData = {
    labels: data.radarData.labels,
    datasets: [
      {
        label: 'Quality Metrics',
        data: data.radarData.values.map(value => 
          typeof value === 'number' ? value : 0
        ),
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        pointBackgroundColor: 'rgb(239, 68, 68)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgb(239, 68, 68)'
      }
    ]
  };

  const barData = {
    labels: ['Quote/RT Ratio', 'Like/Reply Ratio'],
    datasets: [
      {
        label: 'Interaction Ratios',
        data: [
          (data.quoteToRetweetRatio ?? 0) * 100,
          (data.likeToReplyRatio ?? 0)
        ],
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 146, 60, 0.8)'
        ],
        borderColor: [
          'rgb(239, 68, 68)',
          'rgb(251, 146, 60)'
        ],
        borderWidth: 1
      }
    ]
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
        angleLines: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        grid: {
          color: 'rgba(239, 68, 68, 0.1)'
        },
        pointLabels: {
          color: 'rgb(239, 68, 68)'
        },
        ticks: {
          color: 'rgb(239, 68, 68)',
          backdropColor: 'transparent'
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
        text: 'Interaction Ratios',
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
          color: 'rgb(239, 68, 68)'
        }
      }
    }
  };

  return (
    <div className="grid gap-6">
      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Radar data={radarData} options={radarOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Shareability Score</p>
            <p className="text-red-500 text-2xl font-bold">
              {((data.shareabilityScore ?? 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Conversation Depth</p>
            <p className="text-red-500 text-2xl font-bold">
              {((data.conversationDepthScore ?? 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">E/R Ratio</p>
            <p className="text-red-500 text-2xl font-bold">
              {(data.engagementToRetweetRatio ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-red-500/20 bg-black/40">
        <div className="h-[300px]">
          <Bar data={barData} options={barOptions} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-red-400 text-sm">Quote/RT Ratio</p>
            <p className="text-red-500 text-2xl font-bold">
              {((data.quoteToRetweetRatio ?? 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Like/Reply Ratio</p>
            <p className="text-red-500 text-2xl font-bold">
              {((data.likeToReplyRatio ?? 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-red-400 text-sm">Quality Score</p>
            <p className="text-red-500 text-2xl font-bold">
              {(((data.shareabilityScore ?? 0) + (data.conversationDepthScore ?? 0)) * 50).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 