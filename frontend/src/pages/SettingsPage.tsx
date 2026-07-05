import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2, KeyRound, LogOut, Building2, Check, Upload, Palette, ImageIcon } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';

interface Institution {
  id: string;
  name: string;
  slug: string;
  daily_video_limit: number;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_institution_name: string | null;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface NewApiKey {
  id: string;
  name: string;
  api_key: string;
  key_prefix: string;
  created_at: string;
  message: string;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<NewApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Brand state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brandName, setBrandName] = useState('');
  const [brandPrimary, setBrandPrimary] = useState('');
  const [brandSecondary, setBrandSecondary] = useState('');
  const [brandSaved, setBrandSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  const { data: institution } = useQuery<Institution>({
    queryKey: ['current-institution'],
    queryFn: async () => {
      const res = await apiClient.get<Institution>('/api/institutions/current');
      return res.data;
    },
  });

  useEffect(() => {
    if (!institution) return;
    setBrandName((prev) => prev || institution.brand_institution_name || institution.name);
    setBrandPrimary((prev) => prev || institution.brand_primary_color);
    setBrandSecondary((prev) => prev || institution.brand_secondary_color);
  }, [institution]);

  const { data: keysData } = useQuery<{ items: ApiKeyRecord[] }>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await apiClient.get<{ items: ApiKeyRecord[] }>('/api/api-keys');
      return res.data;
    },
  });

  const apiKeys = keysData?.items ?? [];

  // ── Logo upload ──────────────────────────────────────────────────────────
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiClient.post('/api/institutions/current/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await queryClient.invalidateQueries({ queryKey: ['current-institution'] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setLogoError(msg ?? 'Error al subir el logo');
    } finally {
      setLogoUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── Brand update ─────────────────────────────────────────────────────────
  const updateBrand = useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch<Institution>('/api/institutions/current/brand', {
        brand_institution_name: brandName.trim() || null,
        brand_primary_color: brandPrimary,
        brand_secondary_color: brandSecondary,
      });
      return res.data;
    },
    onSuccess: () => {
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 2500);
      void queryClient.invalidateQueries({ queryKey: ['current-institution'] });
    },
  });

  // ── API Keys ─────────────────────────────────────────────────────────────
  const generateKey = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<NewApiKey>('/api/api-keys', { name });
      return res.data;
    },
    onSuccess: (data) => {
      setRevealedKey(data);
      setNewKeyName('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      await apiClient.delete(`/api/api-keys/${keyId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isValidHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

        {/* Institution info */}
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Institución</h2>
          </div>
          {institution ? (
            <div className="space-y-2 text-sm">
              <Row label="Nombre" value={institution.name} />
              <Row label="Slug" value={institution.slug} />
              <Row label="Límite diario" value={`${institution.daily_video_limit} videos`} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Cargando...</p>
          )}
        </section>

        {/* Brand identity */}
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Identidad de marca</h2>
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Estos valores se aplican automáticamente a todos los videos generados (UI y API).
          </p>

          {/* Logo */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Logo</label>
            <div className="flex items-center gap-4">
              {institution?.brand_logo_url ? (
                <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                  <img
                    src={institution.brand_logo_url.startsWith('/')
                      ? `${import.meta.env.VITE_API_URL ?? ''}${institution.brand_logo_url}`
                      : institution.brand_logo_url}
                    alt="Logo actual"
                    className="max-w-full max-h-full object-contain p-1"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1">
                  <ImageIcon className="w-6 h-6 text-gray-300" />
                  <span className="text-xs text-gray-300">Sin logo</span>
                </div>
              )}
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void handleLogoChange(e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {logoUploading ? 'Subiendo...' : institution?.brand_logo_url ? 'Cambiar logo' : 'Subir logo'}
                </button>
                <p className="text-xs text-gray-400">PNG, JPEG o WebP · máx. 2 MB</p>
                {logoError && <p className="text-xs text-red-500">{logoError}</p>}
              </div>
            </div>
          </div>

          {/* Brand name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Nombre en slides
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Ej: Cursia · Plataforma Educativa"
              maxLength={255}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">
              Aparece junto al logo en el footer de cada slide. Si está vacío, usa el nombre de la institución.
            </p>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Color primario"
              value={brandPrimary}
              onChange={setBrandPrimary}
            />
            <ColorField
              label="Color secundario"
              value={brandSecondary}
              onChange={setBrandSecondary}
            />
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => updateBrand.mutate()}
              disabled={
                updateBrand.isPending ||
                !isValidHex(brandPrimary) ||
                !isValidHex(brandSecondary)
              }
              className="flex items-center gap-2 px-5 py-2.5 bg-[#003366] text-white text-sm font-semibold rounded-xl hover:bg-[#003366]/90 disabled:opacity-50 transition-colors"
            >
              {updateBrand.isPending ? (
                'Guardando...'
              ) : brandSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  Guardado
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
            {!isValidHex(brandPrimary) || !isValidHex(brandSecondary) ? (
              <span className="text-xs text-red-500">El color debe ser un hex válido (#RRGGBB)</span>
            ) : null}
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">API Keys</h2>
          </div>

          {revealedKey && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">{revealedKey.message}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-white border border-amber-200 rounded-lg px-3 py-2.5 break-all text-gray-800 select-all">
                  {revealedKey.api_key}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedKey.api_key)}
                  className="p-2 rounded-lg hover:bg-amber-100 text-amber-700 transition-colors flex-shrink-0"
                  title="Copiar"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {copied && <p className="text-xs text-green-700 font-medium">Copiado al portapapeles</p>}
              <button onClick={() => setRevealedKey(null)} className="text-xs text-amber-600 hover:underline">
                He guardado la clave, cerrar
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newKeyName.trim() && generateKey.mutate(newKeyName.trim())}
              placeholder="Nombre (ej: Orbia Local Test)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => generateKey.mutate(newKeyName.trim() || 'default')}
              disabled={generateKey.isPending || !newKeyName.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crear
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin API keys aún</p>
          ) : (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prefijo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Último uso</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {apiKeys.map(k => (
                    <tr key={k.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{k.key_prefix ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('es') : 'Nunca'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.revoked_at ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                          {k.revoked_at ? 'Revocada' : 'Activa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {!k.revoked_at && (
                          <button
                            onClick={() => revokeKey.mutate(k.id)}
                            disabled={revokeKey.isPending}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Revocar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Account */}
        <section className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Cuenta</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">{user?.email}</p>
              <p className="text-xs text-gray-400">Usuario autenticado vía Supabase</p>
            </div>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50">
      <span className="w-36 text-gray-400 text-sm">{label}</span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : '#003366'}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
          placeholder="#003366"
          className={`flex-1 border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            valid ? 'border-gray-200' : 'border-red-300 bg-red-50'
          }`}
        />
      </div>
    </div>
  );
}
