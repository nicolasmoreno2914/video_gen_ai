import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VisualStyle } from '@/types';
import { FileDropzone } from './FileDropzone';
import { StyleSelector } from './StyleSelector';
import { AdvancedConfig } from './AdvancedConfig';
import { useCreateVideo } from '@/hooks/useCreateVideo';
import { apiClient } from '@/services/api';

interface VideoCreatorFormProps {
  onJobCreated: (jobId: string) => void;
}

interface Institution {
  name: string;
  brand_institution_name: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
}

interface FormState {
  title: string;
  content: string;
  fileName: string | null;
  visualStyle: VisualStyle;
  targetMinutes: number;
  voiceId: string;
  uploadYoutube: boolean;
  dryRun: boolean;
  youtubePrivacy: 'unlisted' | 'public' | 'private';
  youtubeTitle: string;
}

export function VideoCreatorForm({ onJobCreated }: VideoCreatorFormProps) {
  const [form, setForm] = useState<FormState>({
    title: '',
    content: '',
    fileName: null,
    visualStyle: 'notebooklm',
    targetMinutes: 10,
    voiceId: '',
    uploadYoutube: false,
    dryRun: false,
    youtubePrivacy: 'unlisted',
    youtubeTitle: '',
  });

  const { data: institution } = useQuery<Institution>({
    queryKey: ['current-institution'],
    queryFn: async () => {
      const res = await apiClient.get<Institution>('/api/institutions/current');
      return res.data;
    },
  });

  const mutation = useCreateVideo();
  const isReady = form.title.trim().length > 0 && form.content.trim().length > 0;

  function handleAdvancedChange(field: string, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady || mutation.isPending) return;

    const result = await mutation.mutateAsync({
      course_id: 'web-upload',
      chapter_id: `chapter-${Date.now()}`,
      title: form.title,
      content_txt: form.content,
      visual_style: form.visualStyle,
      target_duration_minutes: form.targetMinutes,
      dry_run: form.dryRun,
      brand: {
        institution_name: institution?.brand_institution_name || institution?.name || 'Institución Demo',
        primary_color: institution?.brand_primary_color ?? '#003366',
        secondary_color: institution?.brand_secondary_color ?? '#00AEEF',
        voice_id: form.voiceId || undefined,
      },
      youtube: form.uploadYoutube
        ? {
            privacy_status: form.youtubePrivacy,
            title: form.youtubeTitle || form.title,
          }
        : undefined,
    });

    onJobCreated(result.job_id);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div>
        <label className="block text-sm font-inter font-semibold text-gray-700 mb-1.5">
          Título del capítulo <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl font-inter text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent"
          placeholder="Ej: Introducción a la fotosíntesis"
          maxLength={200}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-inter font-semibold text-gray-700 mb-1.5">
          Contenido del capítulo <span className="text-red-400">*</span>
        </label>
        <FileDropzone
          content={form.content}
          fileName={form.fileName}
          onChange={(content, fileName) => setForm((f) => ({ ...f, content, fileName }))}
        />
      </div>

      <div>
        <label className="block text-sm font-inter font-semibold text-gray-700 mb-2">
          Estilo visual
        </label>
        <StyleSelector
          value={form.visualStyle}
          onChange={(style) => setForm((f) => ({ ...f, visualStyle: style }))}
        />
      </div>

      <AdvancedConfig
        targetMinutes={form.targetMinutes}
        voiceId={form.voiceId}
        onChange={handleAdvancedChange}
      />

      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.uploadYoutube}
            onChange={(e) => setForm((f) => ({ ...f, uploadYoutube: e.target.checked }))}
            className="w-4 h-4 accent-brand-secondary"
          />
          <span className="flex items-center gap-1.5 text-sm font-inter font-medium text-gray-700 group-hover:text-brand-primary">
            <Youtube className="w-4 h-4 text-red-500" />
            Subir a YouTube al terminar
          </span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.dryRun}
            onChange={(e) => setForm((f) => ({ ...f, dryRun: e.target.checked }))}
            className="w-4 h-4 accent-brand-secondary"
          />
          <span className="text-sm font-inter font-medium text-gray-700 group-hover:text-brand-primary">
            Modo dry-run <span className="text-gray-400 font-normal">(solo guion + slides, sin audio ni video)</span>
          </span>
        </label>
      </div>

      {form.uploadYoutube && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
          <div>
            <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
              Privacidad en YouTube
            </label>
            <select
              value={form.youtubePrivacy}
              onChange={(e) =>
                setForm((f) => ({ ...f, youtubePrivacy: e.target.value as 'unlisted' | 'public' | 'private' }))
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter bg-white"
            >
              <option value="unlisted">No listado (recomendado)</option>
              <option value="public">Público</option>
              <option value="private">Privado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
              Título en YouTube <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.youtubeTitle}
              onChange={(e) => setForm((f) => ({ ...f, youtubeTitle: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter"
              placeholder={form.title || 'Igual al título del capítulo'}
            />
          </div>
        </div>
      )}

      {mutation.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-inter">
          {mutation.error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!isReady || mutation.isPending}
        className={cn(
          'w-full py-4 rounded-xl font-nunito font-bold text-lg transition-all flex items-center justify-center gap-2',
          isReady && !mutation.isPending
            ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white hover:opacity-90 shadow-lg hover:shadow-xl'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed',
        )}
      >
        {mutation.isPending ? (
          <>
            <span className="animate-spin">⟳</span>
            Enviando...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generar video educativo
          </>
        )}
      </button>
    </form>
  );
}
