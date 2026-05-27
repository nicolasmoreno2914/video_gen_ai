import { Link, useLocation } from 'react-router-dom';
import { Video, Plus, Library, BarChart2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const location = useLocation();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-nunito font-black text-brand-primary text-xl">
          <Video className="w-6 h-6 text-brand-secondary" />
          Video Engine IA
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/" active={location.pathname === '/'}>
            <Plus className="w-4 h-4" />
            Crear video
          </NavLink>
          <NavLink to="/videos" active={location.pathname === '/videos'}>
            <Library className="w-4 h-4" />
            Mis videos
          </NavLink>
          <NavLink to="/costs" active={location.pathname === '/costs'}>
            <BarChart2 className="w-4 h-4" />
            Costos
          </NavLink>
          <NavLink to="/settings" active={location.pathname === '/settings'}>
            <Settings className="w-4 h-4" />
            Ajustes
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-inter font-medium transition-colors',
        active
          ? 'bg-brand-primary text-white'
          : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      {children}
    </Link>
  );
}
