import { useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { VideoCreatorForm } from '@/components/video-creator/VideoCreatorForm';
import { ProgressView } from '@/components/progress/ProgressView';
import { VideoResult } from '@/components/result/VideoResult';
import { ErrorResult } from '@/components/result/ErrorResult';
import { useVideoProgress } from '@/hooks/useVideoProgress';

type PageState = 'form' | 'progress' | 'completed' | 'error';

export function CreatePage() {
  const [pageState, setPageState] = useState<PageState>('form');
  const [jobId, setJobId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const progress = useVideoProgress(
    pageState === 'progress' || pageState === 'completed' || pageState === 'error'
      ? jobId
      : null,
  );

  function handleJobCreated(id: string, videoTitle: string) {
    setJobId(id);
    setTitle(videoTitle);
    setRetryCount(0);
    setPageState('progress');
  }

  function handleReset() {
    progress.reset();
    setJobId(null);
    setTitle('');
    setRetryCount(0);
    setPageState('form');
  }

  function handleRetry() {
    setRetryCount((c) => c + 1);
    progress.reconnect();
    setPageState('progress');
  }

  if (progress.status === 'completed' || progress.status === 'completed_local' || progress.status === 'dry_run_completed') {
    if (pageState !== 'completed') setPageState('completed');
  }
  if (progress.status === 'failed' && pageState === 'progress') {
    setPageState('error');
  }

  return (
    <PageLayout>
      <div className="min-h-screen flex flex-col items-center justify-start px-6 py-12">
        {pageState === 'form' && (
          <div className="w-full max-w-2xl">
            <div className="text-center mb-10">
              <h1 className="font-nunito font-black text-4xl text-brand-primary leading-tight">
                Convierte tu capítulo<br />en un video educativo
              </h1>
              <p className="font-inter text-gray-500 mt-3 text-lg">
                IA + Narración + Ilustraciones • Listo en ~8 minutos
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <VideoCreatorForm
                onJobCreated={(id) => {
                  const inputTitle =
                    (document.querySelector('input[placeholder*="Ej:"]') as HTMLInputElement)
                      ?.value ?? 'Video educativo';
                  handleJobCreated(id, inputTitle);
                }}
              />
            </div>
          </div>
        )}

        {pageState === 'progress' && jobId && (
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <ProgressView title={title} progressState={progress} />
            </div>
          </div>
        )}

        {pageState === 'completed' && jobId && (
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <VideoResult
                jobId={jobId}
                title={title}
                progressState={progress}
                onCreateAnother={handleReset}
              />
            </div>
          </div>
        )}

        {pageState === 'error' && jobId && (
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <ErrorResult
                jobId={jobId}
                error={progress.error}
                failedStep={progress.currentStep}
                retryCount={retryCount}
                onRetry={handleRetry}
                onCreateAnother={handleReset}
              />
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
