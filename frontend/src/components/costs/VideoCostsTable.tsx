import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatUsd, formatSeconds } from '../../lib/costUtils';
import type { VideoCostItem, Pagination } from '../../types/costs';
import { cn } from '@/lib/utils';

interface Props {
  items: VideoCostItem[] | undefined;
  pagination: Pagination | undefined;
  isLoading: boolean;
  onSelectJob: (jobId: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  processing: 'bg-yellow-100 text-yellow-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {status}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

function truncate(str: string, max = 40) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function VideoCostsTable({
  items,
  pagination,
  isLoading,
  onSelectJob,
  page,
  onPageChange,
}: Props) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Costo por video</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Fecha</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">Título</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Duración</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right whitespace-nowrap">Escenas</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right whitespace-nowrap">Imgs IA</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">GPT</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Imágenes</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Voz</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Total</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">Estado</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : !items || items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No hay videos en este período
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.job_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {format(new Date(item.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3 text-gray-900 max-w-[200px]">
                    <span title={item.title}>{truncate(item.title)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {item.duration_seconds != null ? formatSeconds(item.duration_seconds) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-right">{item.scenes_count ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-right">{item.ai_images_count}</td>
                  <td className="px-4 py-3 text-gray-700 text-right font-mono text-xs">
                    {formatUsd(item.breakdown.openai_text)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-right font-mono text-xs">
                    {formatUsd(item.breakdown.openai_images)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-right font-mono text-xs">
                    {formatUsd(item.breakdown.elevenlabs)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 font-mono text-xs">
                    {formatUsd(item.total_cost)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onSelectJob(item.job_id)}
                      className="text-xs text-[#003366] font-medium hover:underline whitespace-nowrap"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Página {page} de {totalPages} — {pagination.total} videos
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
