import { CheckCircle, Loader, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_LABELS, ALL_STEPS } from '@/types';

interface StepTimelineProps {
  completedSteps: string[];
  currentStep: string | null;
  dryRun: boolean;
}

const DRY_RUN_STEPS = [
  'analyzing_content',
  'generating_script',
  'generating_scenes',
  'generating_images',
  'generating_slides',
];

export function StepTimeline({ completedSteps, currentStep, dryRun }: StepTimelineProps) {
  const steps = dryRun ? DRY_RUN_STEPS : ALL_STEPS;

  return (
    <div className="space-y-2">
      {steps.map((step) => {
        const isDone = completedSteps.includes(step);
        const isActive = currentStep === step;
        const label = STEP_LABELS[step] ?? step;

        return (
          <div
            key={step}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-all',
              isActive && 'bg-blue-50',
            )}
          >
            {isDone ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : isActive ? (
              <Loader className="w-5 h-5 text-brand-secondary flex-shrink-0 animate-spin" />
            ) : (
              <Circle className="w-5 h-5 text-gray-200 flex-shrink-0" />
            )}
            <span
              className={cn(
                'text-sm font-inter',
                isDone && 'text-green-700 font-medium',
                isActive && 'text-brand-primary font-semibold',
                !isDone && !isActive && 'text-gray-400',
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
