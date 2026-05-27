import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')} min`;
}

export function estimateTimeRemaining(progress: number): string {
  if (progress <= 0) return '~10 min';
  if (progress >= 100) return '¡Listo!';
  const totalEstimated = 480; // ~8 minutes average
  const elapsed = (progress / 100) * totalEstimated;
  const remaining = Math.round(totalEstimated - elapsed);
  if (remaining < 60) return `~${remaining}s`;
  return `~${Math.round(remaining / 60)} min`;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
