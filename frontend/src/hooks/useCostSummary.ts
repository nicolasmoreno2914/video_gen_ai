import { useQuery } from '@tanstack/react-query';
import { costService } from '../services/costService';
import type { CostSummary } from '../types/costs';

export function useCostSummary(from: string, to: string) {
  return useQuery<CostSummary>({
    queryKey: ['cost-summary', from, to],
    queryFn: () => costService.getSummary(from, to),
    staleTime: 60_000,
    enabled: Boolean(from && to),
  });
}
