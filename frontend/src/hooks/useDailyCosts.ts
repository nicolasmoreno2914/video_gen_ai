import { useQuery } from '@tanstack/react-query';
import { costService } from '../services/costService';
import type { DailyCostEntry } from '../types/costs';

export function useDailyCosts(from: string, to: string) {
  return useQuery<DailyCostEntry[]>({
    queryKey: ['daily-costs', from, to],
    queryFn: () => costService.getDailyCosts(from, to),
    staleTime: 60_000,
    enabled: Boolean(from && to),
  });
}
