import { formatUsd, formatUnits, formatSeconds } from '../../lib/costUtils';
import type { CostSummary } from '../../types/costs';

interface Props {
  summary: CostSummary | undefined;
  isLoading: boolean;
}

interface ProviderRow {
  key: keyof CostSummary['breakdown'];
  label: string;
  usageLabel: string;
  dotColor: string;
  barColor: string;
}

function getProviderRows(summary: CostSummary): ProviderRow[] {
  return [
    {
      key: 'openai_text',
      label: 'OpenAI Texto',
      usageLabel: `${formatUnits(summary.usage.text_tokens_input)} tokens`,
      dotColor: 'bg-blue-500',
      barColor: 'bg-blue-500',
    },
    {
      key: 'openai_images',
      label: 'OpenAI Imágenes',
      usageLabel: `${summary.usage.images_generated} imágenes`,
      dotColor: 'bg-purple-500',
      barColor: 'bg-purple-500',
    },
    {
      key: 'elevenlabs',
      label: 'ElevenLabs',
      usageLabel: `${formatUnits(summary.usage.elevenlabs_characters)} chars`,
      dotColor: 'bg-green-500',
      barColor: 'bg-green-500',
    },
    {
      key: 'render',
      label: 'Render',
      usageLabel: formatSeconds(summary.usage.render_seconds),
      dotColor: 'bg-orange-500',
      barColor: 'bg-orange-500',
    },
    {
      key: 'youtube',
      label: 'YouTube',
      usageLabel: `${summary.usage.youtube_uploads} subidas`,
      dotColor: 'bg-red-500',
      barColor: 'bg-red-500',
    },
  ];
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 animate-pulse">
      <div className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
      <div className="w-32 h-3 bg-gray-200 rounded" />
      <div className="flex-1 h-2 bg-gray-100 rounded-full" />
      <div className="w-12 h-3 bg-gray-200 rounded" />
      <div className="w-10 h-3 bg-gray-100 rounded" />
    </div>
  );
}

export function ProviderBreakdown({ summary, isLoading }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Desglose por proveedor</h2>

      {isLoading || !summary ? (
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {getProviderRows(summary).map((row) => {
            const cost = summary.breakdown[row.key];
            const pct = summary.total_cost > 0
              ? Math.round((cost / summary.total_cost) * 100)
              : 0;

            return (
              <div key={row.key} className="flex items-center gap-4 py-3">
                <span className={`w-2.5 h-2.5 rounded-full ${row.dotColor} shrink-0`} />
                <span className="w-36 text-sm font-medium text-gray-700 shrink-0">
                  {row.label}
                </span>
                <span className="w-28 text-xs text-gray-400 shrink-0">{row.usageLabel}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${row.barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs text-gray-500 shrink-0">{pct}%</span>
                <span className="w-16 text-right text-sm font-semibold text-gray-900 shrink-0">
                  {formatUsd(cost)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
