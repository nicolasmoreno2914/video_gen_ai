import { VideoCard } from './VideoCard';
import { EmptyState } from './EmptyState';
import { VideoJob } from '@/types';

interface VideoGridProps {
  jobs: VideoJob[];
  isLoading: boolean;
  filtered?: boolean;
  onViewDetail: (job: VideoJob) => void;
  onDeleted: (jobId: string) => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-44 bg-gray-100 rounded-t-2xl" />
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
        <div className="h-5 bg-gray-100 rounded-full w-24" />
        <div className="flex gap-2">
          <div className="flex-1 h-8 bg-gray-100 rounded-xl" />
          <div className="w-20 h-8 bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({ jobs, isLoading, filtered, onViewDetail, onDeleted }: VideoGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="grid grid-cols-1">
        <EmptyState filtered={filtered} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {jobs.map((job) => (
        <VideoCard key={job.job_id} job={job} onViewDetail={onViewDetail} onDeleted={onDeleted} />
      ))}
    </div>
  );
}
