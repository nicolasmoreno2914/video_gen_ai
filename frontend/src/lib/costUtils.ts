import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import type { DateRange } from '../types/costs';

export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatUnits(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const ISO_DATE = 'yyyy-MM-dd';

export function getDateRange(range: DateRange): { from: string; to: string; label: string } {
  const now = new Date();

  switch (range) {
    case 'today': {
      const from = format(startOfDay(now), ISO_DATE);
      const to = format(endOfDay(now), ISO_DATE);
      return { from, to, label: 'Hoy' };
    }
    case '7d': {
      const from = format(subDays(now, 6), ISO_DATE);
      const to = format(now, ISO_DATE);
      return { from, to, label: 'Últimos 7 días' };
    }
    case '30d': {
      const from = format(subDays(now, 29), ISO_DATE);
      const to = format(now, ISO_DATE);
      return { from, to, label: 'Últimos 30 días' };
    }
    case 'month': {
      const from = format(startOfMonth(now), ISO_DATE);
      const to = format(endOfMonth(now), ISO_DATE);
      return { from, to, label: 'Mes actual' };
    }
  }
}
