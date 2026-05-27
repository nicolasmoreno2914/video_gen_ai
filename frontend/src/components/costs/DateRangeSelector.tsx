import { cn } from '@/lib/utils';
import type { DateRange } from '../../types/costs';

interface Props {
  value: DateRange;
  onChange: (v: DateRange) => void;
}

const OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'month', label: 'Mes actual' },
];

export function DateRangeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            value === opt.value
              ? 'bg-[#003366] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
