import { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useBranding, buildThemeStyle } from './BrandingProvider';
import { DEFAULT_THEME, type BrandingTheme, type ThemePresetKey } from './types';
import { getThemePreset, THEME_ORDER, THEME_PRESETS, themeFromPreset } from './presets';
import s from './BrandingSettings.module.scss';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export function BrandingSettings() {
  const { business, user, role } = useAuth();
  const { theme, refresh } = useBranding();
  const canEdit = role === 'owner';
  const canViewOnly = role === 'manager' || role === 'employee';

  const [draft, setDraft] = useState<BrandingTheme>(theme);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(theme);
  }, [theme]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(theme), [draft, theme]);
  const activePreset = getThemePreset(draft.themeKey);

  const applyPreset = (themeKey: ThemePresetKey) => {
    if (!canEdit) return;
    setDraft((current) => ({
      ...themeFromPreset(themeKey, current),
      displayName: current.displayName,
      logoUrl: current.logoUrl,
    }));
  };

  const reset = () => {
    setDraft({
      ...DEFAULT_THEME,
      displayName: draft.displayName,
      logoUrl: draft.logoUrl,
    });
  };

  const onFile = async (file: File) => {
    if (!business || !canEdit) return;
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use PNG, JPG, SVG or WEBP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Image must be under 2MB.');
      return;
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
      setDraft((current) => ({ ...current, logoUrl: data.publicUrl }));
      toast.success('Logo uploaded — save to apply it for everyone.');
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!business || !user || !canEdit) return;
    setSaving(true);
    setError(null);
    const { error: dbErr } = await supabase.from('business_branding').upsert(
      {
        business_id: business.id,
        display_name: draft.displayName,
        theme_key: draft.themeKey,
        primary_color: draft.primaryColor,
        secondary_color: draft.secondaryColor,
        accent_color: draft.accentColor,
        surface_color: draft.surfaceColor,
        logo_url: draft.logoUrl,
        updated_by: user.id,
      },
      { onConflict: 'business_id' },
    );
    setSaving(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    toast.success('Theme saved');
    refresh();
  };

  return (
    <Card title="Theme" subtitle="Choose a cohesive workspace theme for your business.">
      <div className={s.wrap}>
        <div className={s.headerRow}>
          <div>
            <div className={s.sectionTitle}>Preset themes</div>
            <p className={s.help}>Owners can switch the workspace look instantly. Everyone else can preview the active theme.</p>
          </div>
          {!canEdit && (
            <div className={s.readOnly}><Lock size={14} /> {canViewOnly ? 'Owner access required to change theme' : 'Sign in to edit'}</div>
          )}
        </div>

        <div className={s.themeGrid}>
          {THEME_ORDER.map((key) => {
            const preset = THEME_PRESETS[key];
            const selected = draft.themeKey === key;
            return (
              <button
                key={preset.key}
                type="button"
                className={`${s.themeCard} ${selected ? s.themeCardActive : ''}`}
                onClick={() => applyPreset(preset.key)}
                disabled={!canEdit}
                aria-pressed={selected}
              >
                <div className={s.themePreview} style={buildThemeStyle(themeFromPreset(preset.key))}>
                  <div className={s.themePreviewSidebar}>
                    <span className={s.previewLogoMark} />
                    <span className={s.previewNavItem} />
                    <span className={`${s.previewNavItem} ${s.previewNavItemMuted}`} />
                  </div>
                  <div className={s.themePreviewBody}>
                    <div className={s.previewToolbar} />
                    <div className={s.previewStatRow}>
                      <span className={s.previewStatCard} />
                      <span className={s.previewStatCard} />
                    </div>
                    <div className={s.previewBadgeRow}>
                      <span className={s.previewBadgeApproved}>Approved</span>
                      <span className={s.previewBadgePending}>Pending</span>
                      <span className={s.previewBadgeDeclined}>Declined</span>
                    </div>
                  </div>
                </div>

                <div className={s.themeMeta}>
                  <div>
                    <div className={s.themeName}>{preset.name}</div>
                    <div className={s.themeDesc}>{preset.description}</div>
                  </div>
                  {selected && <span className={s.selectedPill}><Check size={12} /> Active</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className={s.detailGrid}>
          <div className={s.section}>
            <div className={s.sectionTitle}>Current theme</div>
            <div className={s.summaryCard} style={buildThemeStyle(draft)}>
              <div className={s.summaryBar}>
                <div>
                  <div className={s.summaryLabel}>Selected</div>
                  <div className={s.summaryTitle}>{activePreset.name}</div>
                </div>
                <span className={s.summaryAction}>Live preview</span>
              </div>
              <div className={s.swatches}>
                <span><i style={{ background: draft.primaryColor }} /> Primary</span>
                <span><i style={{ background: draft.secondaryColor }} /> Sidebar</span>
                <span><i style={{ background: draft.surfaceColor }} /> Surface</span>
                <span><i style={{ background: draft.accentColor }} /> Accent</span>
              </div>
            </div>

            <label className={s.logoBox}>
              <span className={s.sectionTitle}>Workspace logo</span>
              <div className={s.logoPreview}>
                {draft.logoUrl ? <img src={draft.logoUrl} alt="Workspace logo" /> : <span className={s.logoEmpty}>No logo</span>}
              </div>
              <div className={s.logoActions}>
                <span className={s.uploadBtn}><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload logo'}</span>
                {draft.logoUrl && canEdit && (
                  <button type="button" className={s.removeBtn} onClick={(e) => { e.preventDefault(); setDraft((current) => ({ ...current, logoUrl: null })); }}>
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
              <input
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                disabled={!canEdit || uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.currentTarget.value = '';
                }}
              />
              <span className={s.help}>PNG, JPG, SVG or WEBP, up to 2MB.</span>
            </label>
          </div>

          <div className={s.section}>
            <div className={s.sectionTitle}>Preview</div>
            <div className={s.preview} style={buildThemeStyle(draft)}>
              <div className={s.previewShell}>
                <aside className={s.previewSidebarPane}>
                  <div className={s.previewWorkspace}>{draft.displayName || business?.name || 'Workspace'}</div>
                  <span className={s.previewSidebarActive}>Dashboard</span>
                  <span className={s.previewSidebarLink}>Rota</span>
                  <span className={s.previewSidebarLink}>Leave</span>
                </aside>
                <div className={s.previewMain}>
                  <div className={s.previewTopline}>Current week</div>
                  <div className={s.previewHeadline}>Good morning, team</div>
                  <div className={s.previewButton}>Publish schedule</div>
                  <div className={s.previewTable}>
                    <div className={s.previewTableRow}><span>Team status</span><span className={s.previewBadgeApproved}>Approved</span></div>
                    <div className={s.previewTableRow}><span>Pending leave</span><span className={s.previewBadgePending}>Pending</span></div>
                    <div className={s.previewTableRow}><span>Declined request</span><span className={s.previewBadgeDeclined}>Declined</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className={s.error}>{error}</div>}

        {canEdit && (
          <div className={s.footer}>
            {dirty && <span className={s.dirty}>You have unsaved theme changes.</span>}
            <Button variant="ghost" onClick={reset} disabled={saving}>Reset</Button>
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save theme'}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}