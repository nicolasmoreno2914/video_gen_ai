import { Download, ExternalLink, RefreshCw, Clock, Film, Eye, Layers, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { cn, formatDuration } from '@/lib/utils';
import { VideoJob } from '@/types';
import { videoService } from '@/services/videoService';

interface VideoCardProps {
  job: VideoJob;
  onViewDetail: (job: VideoJob) => void;
  onDeleted: (jobId: string) => void;
}

function Thumbnail({ job }: { job: VideoJob }) {
  const isActive = job.status === 'queued' || job.status === 'processing';
  const isFailed = job.status === 'failed';
  const isDryRun = job.status === 'dry_run_completed';
  const isCompleted = job.status === 'completed' || job.status === 'completed_local';

  if (isCompleted && job.thumbnail_url) {
    return (
      <img
        src={job.thumbnail_url}
        alt={job.title ?? 'thumbnail'}
        className="w-full h-44 object-cover"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          img.style.display = 'none';
          img.nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        'w-full h-44 flex flex-col items-center justify-center gap-2',
        isActive && 'bg-gradient-to-br from-blue-50 to-sky-100',
        isFailed && 'bg-red-50',
        isDryRun && 'bg-gradient-to-br from-indigo-50 to-violet-100',
        isCompleted && !job.thumbnail_url && 'bg-gradient-to-br from-[#003366]/8 to-[#1a5da8]/10',
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center',
          isActive && 'bg-blue-100',
          isFailed && 'bg-red-100',
          isDryRun && 'bg-indigo-100',
          isCompleted && 'bg-[#003366]/10',
        )}
      >
        {isActive && <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />}
        {isFailed && <XCircle className="w-6 h-6 text-red-400" />}
        {isDryRun && <Eye className="w-6 h-6 text-indigo-500" />}
        {isCompleted && <Film className="w-6 h-6 text-[#003366]/60" />}
      </div>
    </div>
  );
}

function StatusBadge({ job }: { job: VideoJob }) {
  const isActive = job.status === 'queued' || job.status === 'processing';
  const isFailed = job.status === 'failed';
  const isDryRun = job.status === 'dry_run_completed';
  const isCompleted = job.status === 'completed' || job.status === 'completed_local';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isCompleted && (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          Completado
        </span>
      )}
      {isActive && (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          En proceso
        </span>
      )}
      {isFailed && (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      )}
      {isDryRun && (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
          Dry-run
        </span>
      )}
      {job.dry_run && !isDryRun && (
        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-500 text-xs font-semibold rounded-full">
          Dry-run
        </span>
      )}
    </div>
  );
}

export function VideoCard({ job, onViewDetail, onDeleted }: VideoCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isActive = job.status === 'queued' || job.status === 'processing';
  const isCompleted = job.status === 'completed' || job.status === 'completed_local';
  const isFailed = job.status === 'failed';
  const isDryRun = job.status === 'dry_run_completed';

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await videoService.deleteJob(job.job_id);
      onDeleted(job.job_id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const timeAgo = formatDistanceToNow(new Date(job.created_at), {
    addSuffix: true,
    locale: es,
  });

  return (
    <div
      className={cn(
        'rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-md group',
        isCompleted && 'bg-white border-gray-100 shadow-sm',
        isActive && 'bg-white border-blue-100 shadow-sm',
        isFailed && 'bg-red-50/40 border-red-100 shadow-sm',
        isDryRun && 'bg-indigo-50/30 border-indigo-100 shadow-sm',
      )}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden">
        <Thumbnail job={job} />

        {/* Overlay for completed with thumbnail */}
        {isCompleted && job.thumbnail_url && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title + time + delete */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-nunito font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1">
              {job.title ?? `Job ${job.job_id.substring(0, 8)}`}
            </h3>
            <p className="text-xs text-gray-400 font-inter flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </p>
          </div>
          {!isActive && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title={confirmDelete ? 'Haz clic para confirmar' : 'Eliminar'}
              className={cn(
                'shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-inter font-medium transition-colors',
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50',
                deleting && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmDelete && <span>¿Confirmar?</span>}
            </button>
          )}
        </div>

        {/* Status badges */}
        <StatusBadge job={job} />

        {/* Active: progress bar */}
        {isActive && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-inter text-gray-500">
              <span className="truncate">{job.step_label ?? 'En proceso...'}</span>
              <span className="shrink-0 ml-2">{job.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed: meta */}
        {isCompleted && (
          <div className="flex items-center gap-3 text-xs text-gray-500 font-inter">
            {job.duration_seconds != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(job.duration_seconds)}
              </span>
            )}
            {job.scenes_count != null && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {job.scenes_count} escenas
              </span>
            )}
          </div>
        )}

        {/* Dry-run: info */}
        {isDryRun && (
          <div className="flex items-center gap-3 text-xs text-indigo-500 font-inter">
            <span>Guion y slides generados</span>
            {job.scenes_count != null && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {job.scenes_count} escenas
              </span>
            )}
          </div>
        )}

        {/* Failed: error snippet */}
        {isFailed && job.error && (
          <p className="text-xs text-red-500 font-inter line-clamp-2 bg-red-50 rounded-lg px-2.5 py-1.5">
            {job.error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          {/* Primary action */}
          {(isCompleted || isDryRun) && job.local_mp4_available && (
            <a
              href={videoService.getDownloadUrl(job.job_id)}
              download
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#003366] text-white rounded-xl text-xs font-nunito font-bold hover:bg-[#003366]/90 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {isDryRun ? 'Preview sin audio' : 'Descargar MP4'}
            </a>
          )}
          {job.youtube_url && (
            <a
              href={job.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-nunito font-bold hover:bg-red-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              YouTube
            </a>
          )}
          {isFailed && (
            <button
              type="button"
              onClick={() => void videoService.retry(job.job_id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-nunito font-bold hover:bg-red-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          )}

          {/* Secondary: details */}
          <button
            type="button"
            onClick={() => onViewDetail(job)}
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-nunito font-bold transition-colors border',
              (isCompleted && (job.local_mp4_available || job.youtube_url)) || isFailed || (isDryRun && job.local_mp4_available)
                ? 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                : 'flex-1 border-[#003366]/20 text-[#003366] hover:bg-[#003366]/5',
            )}
          >
            Detalles
          </button>
        </div>
      </div>
    </div>
  );
}
