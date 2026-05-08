import { useState, useMemo } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { DateRangeSelector } from '../components/costs/DateRangeSelector';
import { CostSummaryCards } from '../components/costs/CostSummaryCards';
import { ProviderBreakdown } from '../components/costs/ProviderBreakdown';
import { VideoCostsTable } from '../components/costs/VideoCostsTable';
import { VideoCostDetailDrawer } from '../components/costs/VideoCostDetailDrawer';
import { useCostSummary } from '../hooks/useCostSummary';
import { useVideoCosts } from '../hooks/useVideoCosts';
import { getDateRange, formatUsd } from '../lib/costUtils';
import type { DateRange } from '../types/costs';

// ── Margin Simulator ─────────────────────────────────────────────────────────

function MarginSimulator({ averageCost }: { averageCost: number }) {
  const [price, setPrice] = useState<number>(12);

  const marginUsd = price - averageCost;
  const marginPct = price > 0 ? (marginUsd / price) * 100 : 0;
  const isPositive = marginUsd >= 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Simulador de margen</h2>
      <p className="text-sm text-gray-500 mb-5">
        Calcula el margen estimado basado en el costo promedio del período seleccionado.
      </p>

      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Precio de venta por video (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              className="pl-7 pr-4 py-2 border border-gray-200 rounded-xl text-sm w-40 focus:outline-none focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Costo interno</p>
            <p className="text-base font-bold text-gray-900">{formatUsd(averageCost)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-0.5">Precio venta</p>
            <p className="text-base font-bold text-gray-900">{formatUsd(price)}</p>
          </div>
          <div className={`rounded-xl p-3 ${isPositive ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500 mb-0.5">Margen USD</p>
            <p className={`text-base font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
              {isPositive ? '+' : ''}{formatUsd(marginUsd)}
            </p>
          </div>
          <div className={`rounded-xl p-3 ${isPositive ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500 mb-0.5">Margen %</p>
            <p className={`text-base font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
              {isPositive ? '+' : ''}{marginPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CostsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [page, setPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { from, to } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const { data: summary, isLoading: summaryLoading } = useCostSummary(from, to);

  const { data: videoCosts, isLoading: videosLoading } = useVideoCosts({
    from,
    to,
    page,
    limit: 20,
    sort_by: 'total_cost',
    sort_order: 'desc',
  });

  function handleDateRangeChange(v: DateRange) {
    setDateRange(v);
    setPage(1);
  }

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gray-50 pt-16">
        {/* Page header */}
        <div className="bg-white border-b border-gray-100 px-6 py-5">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900">Costos de generación</h1>
            <p className="text-sm text-gray-500 mt-1">
              Monitorea tokens, uso de APIs y costo estimado por video
            </p>
            <div className="mt-4">
              <DateRangeSelector value={dateRange} onChange={handleDateRangeChange} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          <p className="text-xs text-gray-400">
            Costos estimados según configuración actual. No incluyen costos de infraestructura de servidor.
          </p>

          <CostSummaryCards summary={summary} isLoading={summaryLoading} />

          <ProviderBreakdown summary={summary} isLoading={summaryLoading} />

          <VideoCostsTable
            items={videoCosts?.items}
            pagination={videoCosts?.pagination}
            isLoading={videosLoading}
            onSelectJob={setSelectedJobId}
            page={page}
            onPageChange={setPage}
          />

          <MarginSimulator averageCost={summary?.average_cost_per_video ?? 0} />
        </div>
      </div>

      <VideoCostDetailDrawer
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
    </>
  );
}
