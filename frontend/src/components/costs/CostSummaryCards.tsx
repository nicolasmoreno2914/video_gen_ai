import { DollarSign, Video, TrendingDown, MessageSquare, Image, Mic } from 'lucide-react';
import { formatUsd } from '../../lib/costUtils';
import type { CostSummary } from '../../types/costs';

interface Props {
  summary: CostSummary | undefined;
  isLoading: boolean;
}

interface CardDef {
  label: string;
  value: string | number;
  helper?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-gray-200" />
        <div className="h-3 w-24 bg-gray-200 rounded" />
      </div>
      <div className="h-7 w-20 bg-gray-200 rounded mt-2" />
      <div className="h-3 w-16 bg-gray-100 rounded mt-2" />
    </div>
  );
}

function MetricCard({ label, value, helper, icon: Icon, iconBg, iconColor }: CardDef) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-xl ${iconBg} ${iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {helper && <p className="text-xs text-gray-400 mt-1">{helper}</p>}
    </div>
  );
}

export function CostSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const cards: CardDef[] = [
    {
      label: 'Costo total',
      value: formatUsd(summary?.total_cost ?? 0),
      helper: 'En el período seleccionado',
      icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    {
      label: 'Videos generados',
      value: summary?.total_videos ?? 0,
      helper: 'Videos procesados',
      icon: Video,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-600',
    },
    {
      label: 'Costo promedio/video',
      value: formatUsd(summary?.average_cost_per_video ?? 0),
      helper: 'Promedio por video',
      icon: TrendingDown,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    },
    {
      label: 'Costo IA texto',
      value: formatUsd(summary?.breakdown.openai_text ?? 0),
      helper: 'OpenAI GPT',
      icon: MessageSquare,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Costo imágenes IA',
      value: formatUsd(summary?.breakdown.openai_images ?? 0),
      helper: 'OpenAI DALL-E',
      icon: Image,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
    {
      label: 'Costo voz',
      value: formatUsd(summary?.breakdown.elevenlabs ?? 0),
      helper: 'ElevenLabs TTS',
      icon: Mic,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
