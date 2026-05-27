import { Download, ExternalLink, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { formatDuration } from '@/lib/utils';
import { VideoProgressState } from '@/hooks/useVideoProgress';
import { videoService } from '@/services/videoService';

interface VideoResultProps {
  jobId: string;
  title: string;
  progressState: VideoProgressState;
  onCreateAnother: () => void;
}

export function VideoResult({ jobId, title, progressState, onCreateAnother }: VideoResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { downloadUrl, youtubeUrl, durationSeconds, scenesCount, thumbnailUrl, localMp4Available, status } = progressState;
  const isDryRun = status === 'dry_run_completed';
  const canDownload = localMp4Available || !!downloadUrl;

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1">
        <div className="text-5xl">{isDryRun ? '🔍' : '🎉'}</div>
        <h2 className="font-nunito font-black text-2xl text-gray-900">
          {isDryRun ? 'Preview sin audio listo' : '¡Tu video está listo!'}
        </h2>
        {isDryRun && (
          <p className="text-xs text-indigo-600 font-inter bg-indigo-50 px-3 py-1 rounded-full inline-block">
            Dry-run · Sin voz · Revisa las diapositivas
          </p>
        )}
        <p className="text-gray-500 font-inter">{title}</p>
      </div>

      {thumbnailUrl && (
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <img
            src={thumbnailUrl}
            alt="Thumbnail del video"
            className="w-full object-cover max-h-48"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="flex justify-center gap-3 flex-wrap">
        {durationSeconds && (
          <span className="px-3 py-1 bg-blue-50 text-brand-primary rounded-full text-sm font-inter font-medium">
            {formatDuration(durationSeconds)}
          </span>
        )}
        {scenesCount && (
          <span className="px-3 py-1 bg-blue-50 text-brand-primary rounded-full text-sm font-inter font-medium">
            {scenesCount} escenas
          </span>
        )}
        <span className="px-3 py-1 bg-blue-50 text-brand-primary rounded-full text-sm font-inter font-medium">
          notebooklm
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {canDownload && (
          <a
            href={videoService.getDownloadUrl(jobId)}
            download
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-xl font-nunito font-bold text-base hover:opacity-90 transition-opacity shadow-md"
          >
            <Download className="w-5 h-5" />
            {isDryRun ? 'Descargar preview (sin audio)' : 'Descargar MP4'}
          </a>
        )}

        {youtubeUrl && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-nunito font-bold text-base hover:bg-red-600 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Ver en YouTube
          </a>
        )}

        <button
          type="button"
          onClick={onCreateAnother}
          className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-nunito font-bold text-base hover:border-brand-secondary hover:text-brand-primary transition-colors"
        >
          <Plus className="w-5 h-5" />
          Generar otro video
        </button>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 font-inter mx-auto"
      >
        Ver detalles del video
        {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {detailsOpen && (
        <div className="text-left p-4 bg-gray-50 rounded-xl space-y-2 text-sm font-inter text-gray-600 border border-gray-100">
          <p><span className="font-semibold text-gray-700">Job ID:</span> <span className="font-mono text-xs">{jobId}</span></p>
          {durationSeconds && (
            <p><span className="font-semibold text-gray-700">Duración exacta:</span> {durationSeconds}s</p>
          )}
          {scenesCount && (
            <p><span className="font-semibold text-gray-700">Escenas generadas:</span> {scenesCount}</p>
          )}
          <p><span className="font-semibold text-gray-700">Costo estimado:</span> ~$1.05 por video</p>
        </div>
      )}
    </div>
  );
}
