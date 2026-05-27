import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '@/components/layout/PageLayout';
import { VideoGrid } from '@/components/video-list/VideoGrid';
import { VideoDetailDrawer } from '@/components/video-list/VideoDetailDrawer';
import { useVideoList } from '@/hooks/useVideoList';
import { cn } from '@/lib/utils';
import { VideoJob } from '@/types';

type FilterStatus = 'all' | 'processing' | 'completed' | 'failed' | 'dry_run';

function matchesFilter(job: VideoJob, filter: FilterStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'processing') return job.status === 'queued' || job.status === 'processing';
  if (filter === 'completed') return job.status === 'completed' || job.status === 'completed_local';
  if (filter === 'failed') return job.status === 'failed';
  if (filter === 'dry_run') return job.status === 'dry_run_completed' || (job.dry_run && job.status !== 'failed');
  return true;
}

export function VideosPage() {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedJob, setSelectedJob] = useState<VideoJob | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useVideoList({ limit: 100 });
  const allJobs = data?.jobs ?? [];

  function handleDeleted(jobId: string) {
    queryClient.setQueryData<{ jobs: VideoJob[]; total: number }>(
      ['video-list', { limit: 100 }],
      (old) => old ? { jobs: old.jobs.filter((j) => j.job_id !== jobId), total: old.total - 1 } : old,
    );
    if (selectedJob?.job_id === jobId) setSelectedJob(null);
  }

  const counts: Record<FilterStatus, number> = {
    all: allJobs.length,
    processing: allJobs.filter((j) => matchesFilter(j, 'processing')).length,
    completed: allJobs.filter((j) => matchesFilter(j, 'completed')).length,
    failed: allJobs.filter((j) => matchesFilter(j, 'failed')).length,
    dry_run: allJobs.filter((j) => matchesFilter(j, 'dry_run')).length,
  };

  const FILTERS: { id: FilterStatus; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'processing', label: 'En proceso' },
    { id: 'completed', label: 'Completados' },
    { id: 'failed', label: 'Fallidos' },
    { id: 'dry_run', label: 'Dry-run' },
  ];

  const filteredJobs = allJobs.filter((j) => matchesFilter(j, filter));

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-nunito font-black text-3xl text-brand-primary">Mis Videos</h1>
            <p className="font-inter text-gray-500 text-sm mt-0.5">
              {allJobs.length} video{allJobs.length !== 1 ? 's' : ''} generado{allJobs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-xl font-nunito font-bold text-sm hover:opacity-90 transition-opacity shadow"
          >
            <Plus className="w-4 h-4" />
            Generar nuevo video
          </Link>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-7 flex-wrap">
          {FILTERS.map((f) => {
            const count = counts[f.id];
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-inter font-medium transition-colors',
                  active
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                {f.label}
                {!isLoading && count > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <VideoGrid
          jobs={filteredJobs}
          isLoading={isLoading}
          filtered={filter !== 'all'}
          onViewDetail={setSelectedJob}
          onDeleted={handleDeleted}
        />
      </div>

      {/* Detail drawer */}
      <VideoDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </PageLayout>
  );
}
