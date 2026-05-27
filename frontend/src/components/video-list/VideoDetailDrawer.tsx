import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, ExternalLink, Copy, CheckCheck, Clock, Film, Layers, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { VideoJob } from '@/types';
import { videoService } from '@/services/videoService';
import { formatDuration, cn } from '@/lib/utils';

interface Props {
  job: VideoJob | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'En cola',
  processing: 'Procesando',
  completed: 'Completado',
  completed_local: 'Completado local',
  failed: 'Error',
  dry_run_completed: 'Dry-run',
};

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  completed_local: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  dry_run_completed: 'bg-indigo-100 text-indigo-700',
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 font-inter shrink-0 w-28">{label}</span>
      <span className="text-xs text-gray-700 font-inter text-right">{value}</span>
    </div>
  );
}

export function VideoDetailDrawer({ job, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function copyId() {
    if (!job) return;
    void navigator.clipboard.writeText(job.job_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isCompleted = job?.status === 'completed' || job?.status === 'completed_local';
  const isDryRun = job?.status === 'dry_run_completed';

  return (
    <Dialog.Root open={!!job} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <Dialog.Title className="font-nunito font-bold text-gray-900 text-base">
              Detalle del video
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {job && (
            <div className="flex-1 overflow-y-auto">
              {/* Title + status */}
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-nunito font-bold text-gray-900 text-sm leading-snug mb-2">
                  {job.title ?? `Job ${job.job_id.substring(0, 8)}`}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_STYLES[job.status])}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                  {job.dry_run && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600">
                      Dry-run
                    </span>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="px-5 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Información</p>

                {/* Job ID */}
                <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 font-inter shrink-0 w-28">Job ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-mono">{job.job_id.substring(0, 16)}…</span>
                    <button onClick={copyId} className="text-gray-400 hover:text-gray-600 transition-colors">
                      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <MetaRow
                  label="Creado"
                  value={
                    <span title={job.created_at}>
                      {format(new Date(job.created_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                  }
                />
                <MetaRow
                  label="Hace"
                  value={formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: es })}
                />
                {job.duration_seconds && (
                  <MetaRow
                    label="Duración"
                    value={
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(job.duration_seconds)}
                      </span>
                    }
                  />
                )}
                {job.scenes_count && (
                  <MetaRow
                    label="Escenas"
                    value={
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {job.scenes_count} escenas
                      </span>
                    }
                  />
                )}
                {job.retry_count > 0 && (
                  <MetaRow label="Reintentos" value={`${job.retry_count} intento${job.retry_count !== 1 ? 's' : ''}`} />
                )}
              </div>

              {/* Error */}
              {job.status === 'failed' && job.error && (
                <div className="px-5 py-3 border-b border-gray-50">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Error
                  </p>
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-xs text-red-700 font-inter leading-relaxed">{job.error}</p>
                  </div>
                </div>
              )}

              {/* Progress */}
              {(job.status === 'queued' || job.status === 'processing') && (
                <div className="px-5 py-3 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Progreso</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-inter text-gray-500">
                      <span>{job.step_label ?? 'En proceso...'}</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              {(isCompleted || isDryRun || job.youtube_url) && (
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acciones</p>
                  <div className="space-y-2">
                    {(isCompleted || isDryRun) && job.local_mp4_available && (
                      <a
                        href={videoService.getDownloadUrl(job.job_id)}
                        download
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-nunito font-bold hover:bg-[#003366]/90 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        {isDryRun ? 'Descargar preview (sin audio)' : 'Descargar MP4'}
                      </a>
                    )}
                    {job.youtube_url && (
                      <a
                        href={job.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-nunito font-bold hover:bg-red-600 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver en YouTube
                      </a>
                    )}
                    {isCompleted && !job.local_mp4_available && !job.youtube_url && (
                      <div className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-50 text-gray-400 rounded-xl text-sm">
                        <Film className="w-4 h-4" />
                        Sin archivo disponible
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] text-gray-400 text-center font-inter">Video Engine IA · uso interno</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
