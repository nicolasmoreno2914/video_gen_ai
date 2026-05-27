import { useState } from 'react';
import { ChevronDown, ChevronUp, Settings } from 'lucide-react';

interface AdvancedConfigProps {
  primaryColor: string;
  secondaryColor: string;
  institutionName: string;
  targetMinutes: number;
  voiceId: string;
  onChange: (field: string, value: string | number) => void;
}

export function AdvancedConfig({
  primaryColor,
  secondaryColor,
  institutionName,
  targetMinutes,
  voiceId,
  onChange,
}: AdvancedConfigProps) {
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
                Color primario
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => onChange('primaryColor', e.target.value)}
                  className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => onChange('primaryColor', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter font-mono"
                  placeholder="#003366"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
                Color secundario
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => onChange('secondaryColor', e.target.value)}
                  className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => onChange('secondaryColor', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter font-mono"
                  placeholder="#00AEEF"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
              Nombre de la institución
            </label>
            <input
              type="text"
              value={institutionName}
              onChange={(e) => onChange('institutionName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter"
              placeholder="Mi Institución Educativa"
            />
          </div>

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

          <div>
            <label className="block text-sm font-inter font-medium text-gray-700 mb-1">
              Voice ID de ElevenLabs <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => onChange('voiceId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-inter font-mono"
              placeholder="Usa la voz configurada por defecto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
