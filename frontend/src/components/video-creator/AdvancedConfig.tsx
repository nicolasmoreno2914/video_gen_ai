import { useState } from 'react';
import { ChevronDown, ChevronUp, Settings } from 'lucide-react';

interface AdvancedConfigProps {
  targetMinutes: number;
  onChange: (field: string, value: string | number) => void;
}

export function AdvancedConfig({ targetMinutes, onChange }: AdvancedConfigProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 font-inter font-medium text-gray-700">
          <Settings className="w-4 h-4 text-brand-secondary" />
          Configuración avanzada
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="p-4 border-t border-gray-100 space-y-4">
          <div>
            <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
              Duración objetivo: <span className="text-brand-secondary font-semibold">{targetMinutes} minutos</span>
            </label>
            <input
              type="range"
              min={5}
              max={15}
              value={targetMinutes}
              onChange={(e) => onChange('targetMinutes', Number(e.target.value))}
              className="w-full accent-brand-secondary"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>5 min</span>
              <span>15 min</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
