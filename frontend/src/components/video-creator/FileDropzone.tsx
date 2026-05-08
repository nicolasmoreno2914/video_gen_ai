import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload } from 'lucide-react';
import { cn, countWords } from '@/lib/utils';

interface FileDropzoneProps {
  content: string;
  fileName: string | null;
  onChange: (content: string, fileName: string) => void;
}

export function FileDropzone({ content, fileName, onChange }: FileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) ?? '';
        onChange(text, file.name);
      };
      reader.readAsText(file, 'utf-8');
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt'] },
    maxFiles: 1,
  });

  const wordCount = content ? countWords(content) : 0;
  const isShort = content && wordCount < 500;

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-brand-secondary bg-blue-50'
            : 'border-gray-200 hover:border-brand-secondary hover:bg-gray-50',
        )}
      >
        <input {...getInputProps()} />
        {fileName ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-8 h-8 text-brand-secondary" />
            <div className="text-left">
              <p className="font-inter font-semibold text-gray-800">{fileName}</p>
              <p className="text-sm text-gray-500">{wordCount.toLocaleString()} palabras detectadas</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="font-inter font-medium text-gray-600">
              Arrastra tu archivo <span className="text-brand-secondary">.txt</span> aquí o{' '}
              <span className="text-brand-secondary underline">haz clic para seleccionar</span>
            </p>
            <p className="text-sm text-gray-400">Solo archivos .txt hasta 80.000 caracteres</p>
          </div>
        )}
      </div>

      {content && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-inter font-medium',
            isShort
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-green-50 text-green-700 border border-green-200',
          )}
        >
          <span>{isShort ? '⚠' : '✓'}</span>
          {isShort
            ? `Contenido corto (${wordCount} palabras) — la IA lo expandirá automáticamente`
            : `${wordCount.toLocaleString()} palabras detectadas`}
        </div>
      )}
    </div>
  );
}
