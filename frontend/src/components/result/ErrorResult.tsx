import { AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { videoService } from '@/services/videoService';

interface ErrorResultProps {
  jobId: string;
  error: string | null;
  failedStep: string | null;
  retryCount: number;
  onRetry: () => void;
  onCreateAnother: () => void;
}

export function ErrorResult({
  jobId,
  error,
  retryCount,
  onRetry,
  onCreateAnother,
}: ErrorResultProps) {
  const retryMutation = useMutation({
    mutationFn: () => videoService.retry(jobId),
    onSuccess: () => onRetry(),
  });

  return (
    <div className="space-y-5 text-center">
      <div>
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="font-nunito font-black text-xl text-gray-900">Error generando el video</h2>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm font-inter text-red-700 text-left">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 font-inter">
        Intento {retryCount} de 3
      </p>

      <div className="flex flex-col gap-3">
        {retryCount < 3 && (
          <button
            type="button"
            onClick={() => void retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-nunito font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
            {retryMutation.isPending ? 'Reintentando...' : 'Reintentar desde aquí'}
          </button>
        )}

        <button
          type="button"
          onClick={onCreateAnother}
          className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-nunito font-bold hover:border-gray-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo video
        </button>
      </div>
    </div>
  );
}
