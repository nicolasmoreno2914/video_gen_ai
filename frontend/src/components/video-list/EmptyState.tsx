import { Link } from 'react-router-dom';
import { Film, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  filtered?: boolean;
}

export function EmptyState({ filtered = false }: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#003366]/8 flex items-center justify-center mb-5">
        <Film className="w-8 h-8 text-[#003366]/40" />
      </div>
      <h3 className="font-nunito font-black text-xl text-gray-700 mb-2">
        {filtered ? 'Sin resultados' : 'Aún no hay videos'}
      </h3>
      <p className="font-inter text-gray-500 text-sm mb-8 max-w-xs leading-relaxed">
        {filtered
          ? 'Ningún video coincide con el filtro seleccionado.'
          : '¡Sube tu primer capítulo y en minutos tendrás un video educativo narrado con IA!'}
      </p>
      {!filtered && (
        <Link
          to="/"
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-xl font-nunito font-bold hover:opacity-90 transition-opacity shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          Generar mi primer video
        </Link>
      )}
    </div>
  );
}
