import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Upload, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBranding } from './BrandingProvider';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Field } from '@/components/common/Field';
import { contrastRatio, hexToRgb, isValidHex } from './contrast';
import { BrandingTheme, DEFAULT_THEME } from './types';
import s from './BrandingSettings.module.scss';

type ColorKey = 'primaryColor' | 'secondaryColor' | 'accentColor' | 'surfaceColor';

const COLOR_FIELDS: Array<{ key: ColorKey; label: string; help: string; checkAgainst: ColorKey }> = [
  { key: 'primaryColor',   label: 'Primary',    help: 'Buttons, links, active nav', checkAgainst: 'surfaceColor' },
  { key: 'secondaryColor', label: 'Sidebar',    help: 'Top bar and side nav background', checkAgainst: 'surfaceColor' },
  { key: 'accentColor',    label: 'Accent',     help: 'Highlights and callouts', checkAgainst: 'surfaceColor' },
  { key: 'surfaceColor',   label: 'Background', help: 'App background surface', checkAgainst: 'primaryColor' },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

function ContrastBadge({ a, b }: { a: string; b: string }) {
  const ratio = useMemo(() => {
    const ra = hexToRgb(a); const rb = hexToRgb(b);
    if (!ra || !rb) return null;
    return contrastRatio(ra, rb);
  }, [a, b]);
  if (ratio == null) return null;
  const ok = ratio >= 4.5;
  return (
    <span className={`${s.contrast} ${ok ? s.contrastOk : s.contrastBad}`} title={ok ? 'Meets WCAG AA' : 'Below WCAG AA — text may be hard to read'}>
      {ok ? <Check size={12} /> : '!'} {ratio.toFixed(2)}:1
    </span>
  );
}

export function BrandingSettings() {
  const { business, user, role } = useAuth();
  const { theme, refresh } = useBranding();
  const canEdit = role === 'owner' || role === 'manager';

  const [draft, setDraft] = useState<BrandingTheme>(theme);
  const [hexInputs, setHexInputs] = useState<Record<ColorKey, string>>({
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    surfaceColor: theme.surfaceColor,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(theme);
    setHexInputs({
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      accentColor: theme.accentColor,
      surfaceColor: theme.surfaceColor,
    });
  }, [theme]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(theme), [draft, theme]);

  const setColor = (key: ColorKey, value: string) => {
    setDraft(d => ({ ...d, [key]: value }));
    setHexInputs(h => ({ ...h, [key]: value }));
  };

  const onHexChange = (key: ColorKey, value: string) => {
    const v = value.startsWith('#') ? value : `#${value}`;
    setHexInputs(h => ({ ...h, [key]: v }));
    if (isValidHex(v)) setDraft(d => ({ ...d, [key]: v.toLowerCase() }));
  };

  const onFile = async (file: File) => {
    if (!business) return;
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use PNG, JPG, SVG or WEBP.'); return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Image must be under 2MB.'); return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${business.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('business-logos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('business-logos').getPublicUrl(path);
      setDraft(d => ({ ...d, logoUrl: data.publicUrl }));
      toast.success('Logo uploaded — remember to save.');
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = () => setDraft(d => ({ ...d, logoUrl: null }));

  const reset = () => {
    setDraft({ ...DEFAULT_THEME, displayName: draft.displayName, logoUrl: draft.logoUrl });
  };

  const save = async () => {
    if (!business || !user) return;
    setError(null);
    for (const f of COLOR_FIELDS) {
      if (!isValidHex(draft[f.key])) {
        setError(`${f.label} colour is not a valid hex.`);
        return;
      }
    }
    setSaving(true);
    const { error: dbErr } = await supabase.from('business_branding').upsert({
      business_id: business.id,
      display_name: draft.displayName,
      primary_color: draft.primaryColor,
      secondary_color: draft.secondaryColor,
      accent_color: draft.accentColor,
      surface_color: draft.surfaceColor,
      logo_url: draft.logoUrl,
      updated_by: user.id,
    }, { onConflict: 'business_id' });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    toast.success('Branding saved');
    refresh();
  };

  return (
    <Card title="Branding & appearance" subtitle="Customise the look of your workspace. Visible only to your team.">
      <div className={s.wrap}>
        <div className={s.grid}>
          {/* LEFT: form */}
          <div className={s.section}>
            <Field label="Workspace display name" hint="Shown in the header instead of the business name (optional).">
              <input
                value={draft.displayName ?? ''}
                onChange={e => setDraft(d => ({ ...d, displayName: e.target.value || null }))}
                placeholder={business?.name ?? 'Your workspace'}
                disabled={!canEdit}
                maxLength={60}
              />
            </Field>

            <div className={s.section}>
              <div className={s.sectionTitle}>Colours</div>
              {COLOR_FIELDS.map(f => (
                <Field key={f.key} label={f.label} hint={f.help}>
                  <div className={s.colorRow}>
                    <input
                      type="color"
                      className={s.swatch}
                      value={isValidHex(draft[f.key]) ? draft[f.key] : '#000000'}
                      onChange={e => setColor(f.key, e.target.value)}
                      disabled={!canEdit}
                      aria-label={`${f.label} colour picker`}
                    />
                    <input
                      className={s.hexInput}
                      value={hexInputs[f.key]}
                      onChange={e => onHexChange(f.key, e.target.value)}
                      disabled={!canEdit}
                      maxLength={7}
                      spellCheck={false}
                    />
                    <ContrastBadge a={draft[f.key]} b={draft[f.checkAgainst]} />
                  </div>
                </Field>
              ))}
              <p className={s.help}>Text colour on coloured surfaces is auto-adjusted to stay readable.</p>
            </div>

            <div className={s.section}>
              <div className={s.sectionTitle}>Logo</div>
              <div className={s.logoBox}>
                <div className={s.logoPreview}>
                  {draft.logoUrl
                    ? <img src={draft.logoUrl} alt="Workspace logo" />
                    : <span className={s.logoEmpty}>No logo yet</span>}
                </div>
                <div className={s.logoActions}>
                  <label className={s.fileBtn}>
                    <Upload size={14} />
                    <span>{uploading ? 'Uploading…' : draft.logoUrl ? 'Replace' : 'Upload'}</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ALLOWED_TYPES.join(',')}
                      disabled={!canEdit || uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                    />
                  </label>
                  {draft.logoUrl && canEdit && (
                    <button type="button" className={s.fileBtn} onClick={removeLogo}>
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
                </div>
                <p className={s.help}>PNG, JPG, SVG or WEBP. Max 2MB. Transparent backgrounds work best.</p>
              </div>
            </div>
          </div>

          {/* RIGHT: live preview */}
          <div className={s.section}>
            <div className={s.sectionTitle}>Live preview</div>
            <div
              className={s.preview}
              style={{
                // Apply draft colors locally so preview always shows the unsaved state
                ['--brand-primary' as any]: draft.primaryColor,
                ['--brand-primary-fg' as any]: '#fff',
                ['--brand-primary-soft' as any]: draft.primaryColor + '1a',
                ['--brand-secondary' as any]: draft.secondaryColor,
                ['--brand-secondary-fg' as any]: '#fff',
                ['--brand-accent' as any]: draft.accentColor,
                ['--brand-accent-fg' as any]: '#fff',
                ['--brand-surface' as any]: draft.surfaceColor,
              }}
            >
              <div className={s.previewBar}>
                {draft.logoUrl
                  ? <img src={draft.logoUrl} alt="" />
                  : <span className={s.previewBarBrand}>{draft.displayName || business?.name || 'Workspace'}</span>}
                <span className={s.previewBarBrand} style={{ opacity: 0.7, fontSize: 12 }}>Dashboard</span>
              </div>
              <div className={s.previewBody}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '0.06em', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>This week</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#0f172a' }}>Good morning, team</div>
                </div>
                <button type="button" className={s.previewBtnPrimary}>Publish schedule</button>
                <div className={s.previewBadgeRow}>
                  <span className={s.previewBadge}>Working</span>
                  <span className={s.previewBadge}>On leave</span>
                  <span className={`${s.previewBadge} ${s.previewBadgeAccent}`}>Pending</span>
                </div>
                <a className={s.previewLink} href="#" onClick={e => e.preventDefault()}>View team →</a>
              </div>
            </div>
          </div>
        </div>

        {error && <div className={s.error}>{error}</div>}

        {canEdit && (
          <div className={s.footer}>
            {dirty && <span className={s.dirty}>You have unsaved changes</span>}
            <Button variant="ghost" onClick={reset} disabled={saving}>Reset to defaults</Button>
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
