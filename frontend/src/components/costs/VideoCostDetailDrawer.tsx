import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { useVideoCostDetail } from '../../hooks/useVideoCostDetail';
import { formatUsd, formatSeconds } from '../../lib/costUtils';
import { cn } from '@/lib/utils';

interface Props {
  jobId: string | null;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  processing: 'bg-yellow-100 text-yellow-700',
};

interface ProviderBarDef {
  key: 'openai_text' | 'openai_images' | 'elevenlabs' | 'render' | 'youtube';
  label: string;
  barColor: string;
  dotColor: string;
}

const PROVIDER_BARS: ProviderBarDef[] = [
  { key: 'openai_text', label: 'OpenAI Texto', barColor: 'bg-blue-500', dotColor: 'bg-blue-500' },
  { key: 'openai_images', label: 'OpenAI Imágenes', barColor: 'bg-purple-500', dotColor: 'bg-purple-500' },
  { key: 'elevenlabs', label: 'ElevenLabs', barColor: 'bg-green-500', dotColor: 'bg-green-500' },
  { key: 'render', label: 'Render', barColor: 'bg-orange-500', dotColor: 'bg-orange-500' },
  { key: 'youtube', label: 'YouTube', barColor: 'bg-red-500', dotColor: 'bg-red-500' },
];

function SkeletonContent() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div>
        <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-32 bg-gray-100 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4">
            <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
            <div className="w-32 h-3 bg-gray-200 rounded" />
            <div className="flex-1 h-2 bg-gray-100 rounded-full" />
            <div className="w-14 h-3 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerContent({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useVideoCostDetail(jobId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
        <div className="min-w-0 pr-4">
          {isLoading || !detail ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 w-56 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900 truncate">{detail.title}</h2>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium capitalize shrink-0',
                    STATUS_STYLES[detail.status] ?? 'bg-gray-100 text-gray-600',
                  )}
                >
                  {detail.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{detail.job_id}</p>
            </>
          )}
        </div>
        <Dialog.Close asChild>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </Dialog.Close>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || !detail ? (
          <SkeletonContent />
        ) : (
          <div className="p-6 space-y-6">
            {/* Metric boxes */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Costo total', value: formatUsd(detail.estimated_total_cost) },
                { label: 'Costo/minuto', value: formatUsd(detail.cost_per_minute) },
                { label: 'Costo/escena', value: formatUsd(detail.cost_per_scene) },
                { label: 'Duración', value: formatSeconds(detail.duration_seconds) },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Breakdown bars */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Desglose por proveedor</h3>
              <div className="space-y-2">
                {PROVIDER_BARS.map((row) => {
                  const cost = detail.breakdown[row.key];
                  const pct =
                    detail.estimated_total_cost > 0
                      ? Math.round((cost / detail.estimated_total_cost) * 100)
                      : 0;
                  return (
                    <div key={row.key} className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${row.dotColor} shrink-0`} />
                      <span className="w-32 text-xs text-gray-600 shrink-0">{row.label}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${row.barColor} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs text-gray-400 shrink-0">{pct}%</span>
                      <span className="w-14 text-right text-xs font-semibold text-gray-800 shrink-0 font-mono">
                        {formatUsd(cost)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Usage logs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Logs de uso</h3>
              {detail.usage_logs.length === 0 ? (
                <p className="text-xs text-gray-400">Sin logs registrados.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Proveedor', 'Operación', 'Modelo', 'Tipo', 'Input', 'Output', 'Costo', 'Fecha'].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detail.usage_logs.map((log, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700 capitalize">{log.provider}</td>
                          <td className="px-3 py-2 text-gray-600">{log.operation}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono">{log.model_name}</td>
                          <td className="px-3 py-2 text-gray-500">{log.unit_type}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{log.input_units.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{log.output_units.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 font-mono">
                            {formatUsd(log.estimated_cost)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                            {format(new Date(log.created_at), 'dd MMM HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 shrink-0">
        <p className="text-xs text-gray-400">
          Costos estimados según configuración actual
        </p>
      </div>
    </div>
  );
}

export function VideoCostDetailDrawer({ jobId, onClose }: Props) {
  return (
    <Dialog.Root open={jobId !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300 focus:outline-none">
          <Dialog.Title className="sr-only">Detalle de costos del video</Dialog.Title>
          {jobId && <DrawerContent jobId={jobId} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
