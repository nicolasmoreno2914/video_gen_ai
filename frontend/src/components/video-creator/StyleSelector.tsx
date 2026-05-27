import { BookOpen, PenTool, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VisualStyle } from '@/types';

const STYLES: { id: VisualStyle; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'notebooklm',
    label: 'NotebookLM',
    description: 'Doodles educativos en fondo blanco',
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    description: 'Estilo pizarra limpia',
    icon: <PenTool className="w-5 h-5" />,
  },
  {
    id: 'sketch',
    label: 'Sketch',
    description: 'Boceto dibujado a mano',
    icon: <Pencil className="w-5 h-5" />,
  },
];

interface StyleSelectorProps {
  value: VisualStyle;
  onChange: (style: VisualStyle) => void;
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          onClick={() => onChange(style.id)}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left',
            value === style.id
              ? 'border-brand-secondary bg-blue-50 text-brand-primary'
              : 'border-gray-200 hover:border-gray-300 text-gray-600',
          )}
        >
          <div
            className={cn(
              'p-2 rounded-lg',
              value === style.id ? 'bg-brand-secondary text-white' : 'bg-gray-100',
            )}
          >
            {style.icon}
          </div>
          <div>
            <p className="font-nunito font-bold text-sm">{style.label}</p>
            <p className="text-xs text-gray-500 leading-tight">{style.description}</p>
          </div>
          {value === style.id && (
            <span className="text-xs font-inter font-semibold text-brand-secondary">✓ Seleccionado</span>
          )}
        </button>
      ))}
    </div>
  );
}
