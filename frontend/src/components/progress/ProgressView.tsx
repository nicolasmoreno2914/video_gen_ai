import { Clock } from 'lucide-react';
import { estimateTimeRemaining } from '@/lib/utils';
import { StepTimeline } from './StepTimeline';
import { VideoProgressState } from '@/hooks/useVideoProgress';

interface ProgressViewProps {
  title: string;
  progressState: VideoProgressState;
}

export function ProgressView({ title, progressState }: ProgressViewProps) {
  const { progress, currentStep, stepLabel } = progressState;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-nunito font-black text-xl text-gray-900">{title}</h2>
        <p className="text-sm font-inter text-gray-500 mt-0.5">Generando tu video educativo...</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm font-inter">
          <span className="text-brand-primary font-semibold">{stepLabel ?? 'Iniciando...'}</span>
          <span className="text-gray-500 font-medium">{progress}%</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <StepTimeline
        completedSteps={progressState.status === 'processing' ? [] : []}
        currentStep={currentStep}
        dryRun={false}
      />

      <div className="flex items-center gap-2 text-sm text-gray-500 font-inter">
        <Clock className="w-4 h-4" />
        <span>Tiempo estimado restante: {estimateTimeRemaining(progress)}</span>
      </div>
    </div>
  );
}
