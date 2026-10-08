import { errorMessage } from '@/lib/errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lock, Upload, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { buildThemeStyle, useBranding } from './brandingContext';
import type { BrandingTheme, ThemePresetKey } from './types';
import { THEME_ORDER, THEME_PRESETS, getThemePreset, themeFromPreset } from './presets';
import s from './BrandingSettings.module.scss';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export function BrandingSettings() {
  const { business, user, role } = useAuth();
  const { theme, savedTheme, refresh, previewTheme, clearPreviewTheme } = useBranding();
  const canEdit = role === 'owner';
  const canViewOnly = role === 'manager' || role === 'employee';

  const [draft, setDraft] = useState<BrandingTheme>(savedTheme);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const uploadSubmitting = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(savedTheme);
  }, [savedTheme]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedTheme), [draft, savedTheme]);
  const activePreset = getThemePreset(draft.themeKey);

  useEffect(() => {
    if (!canEdit) return undefined;
    previewTheme(dirty ? draft : null);
    return () => clearPreviewTheme();
  }, [canEdit, dirty, draft, previewTheme, clearPreviewTheme]);

  const applyPreset = (themeKey: ThemePresetKey) => {
    if (!canEdit) return;
    setDraft((current) => ({
      ...themeFromPreset(themeKey, current),
      displayName: current.displayName,
      logoUrl: current.logoUrl,
    }));
  };

  const reset = () => {
    setDraft(savedTheme);
    setError(null);
  };

  const onFile = async (file: File) => {
    if (!business || !canEdit || submitting.current || uploadSubmitting.current) return;
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use PNG, JPG, SVG or WEBP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Image must be under 2MB.');
      return;
    }

    uploadSubmitting.current = true;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${business.id}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('business-logos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('business-logos').getPublicUrl(path);
      setDraft((current) => ({ ...current, logoUrl: data.publicUrl }));
      toast.success('Logo uploaded. Save to apply it for everyone.');
    } catch (e) {
      setError(errorMessage(e, 'Upload failed'));
    } finally {
      uploadSubmitting.current = false;
      setUploading(false);
    }
  };

  const save = async () => {
    if (!business || !user || !canEdit || submitting.current || uploadSubmitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase.from('business_branding').upsert({
        business_id: business.id, display_name: draft.displayName, theme_key: draft.themeKey,
        primary_color: draft.primaryColor, secondary_color: draft.secondaryColor,
        accent_color: draft.accentColor, surface_color: draft.surfaceColor,
        logo_url: draft.logoUrl, updated_by: user.id,
      }, { onConflict: 'business_id' }).select('business_id');
      if (dbErr) throw dbErr;
      if (data?.length !== 1) throw new Error('Theme was not saved. Please try again.');
      toast.success('Theme saved');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not save theme. Please try again.'));
    } finally { submitting.current = false; setSaving(false); }
  };

  return (
    <Card title="Theme" subtitle="Apply a curated business theme across the workspace.">
      <div className={s.wrap}>
        <div className={s.headerRow}>
          <div>
            <div className={s.sectionTitle}>Preset themes</div>
            <p className={s.help}>Owners can preview themes live before saving them for the whole business.</p>
          </div>
          {!canEdit && (
            <div className={s.readOnly}><Lock size={14} /> {canViewOnly ? 'Only Owners can change the active theme' : 'Sign in to edit theme settings'}</div>
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
                disabled={!canEdit || saving || uploading}
                aria-label={preset.name}
                aria-pressed={selected}
              >
                <div aria-hidden="true" className={s.themePreview} style={buildThemeStyle(themeFromPreset(preset.key))}>
                  <div className={s.themePreviewSidebar}>
                    <span className={s.previewLogoMark} />
                    <span className={s.previewNavItem} />
                    <span className={`${s.previewNavItem} ${s.previewNavItemMuted}`} />
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
                    </div>
                    <div className={s.previewMiniTable}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>

                <div className={s.themeMeta}>
                  <div>
                    <div className={s.themeName}>{preset.name}</div>
                    <div className={s.themeDesc}>{preset.description}</div>
                  </div>
                  {selected && <span className={s.selectedPill}><Check size={12} /> Selected</span>}
                </div>
              </button>
            );
          })}
        </div>

        <details className={s.customisation}>
          <summary>Theme details and workspace logo <ChevronDown size={16} aria-hidden /></summary>
        <div className={s.detailGrid}>
          <div className={s.section}>
            <div className={s.sectionTitle}>Live theme summary</div>
            <div className={s.summaryCard} style={buildThemeStyle(draft)}>
              <div className={s.summaryBar}>
                <div>
                  <div className={s.summaryLabel}>Current selection</div>
                  <div className={s.summaryTitle}>{activePreset.name}</div>
                </div>
                <span className={s.summaryAction}>{dirty ? 'Unsaved live preview' : 'Saved theme'}</span>
              </div>
              <div className={s.swatches}>
                <span><i style={{ background: activePreset.primaryColor }} /> Primary</span>
                <span><i style={{ background: activePreset.bgColor }} /> Canvas</span>
                <span><i style={{ background: activePreset.surfaceColor }} /> Surface</span>
                <span><i style={{ background: activePreset.sidebarColor }} /> Sidebar</span>
                <span><i style={{ background: activePreset.successColor }} /> Success</span>
                <span><i style={{ background: activePreset.warningColor }} /> Warning</span>
              </div>
            </div>

            <label className={s.logoBox}>
              <span className={s.sectionTitle}>Workspace logo</span>
              <div className={s.logoPreview} style={buildThemeStyle(draft)}>
                {draft.logoUrl ? <img src={draft.logoUrl} alt="Workspace logo" /> : <span className={s.logoEmpty}>No logo</span>}
              </div>
              <div className={s.logoActions}>
                <span className={s.uploadBtn}><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload logo'}</span>
                {draft.logoUrl && canEdit && (
                  <button type="button" className={s.removeBtn} disabled={saving || uploading} onClick={(e) => { e.preventDefault(); setDraft((current) => ({ ...current, logoUrl: null })); }}>
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
              <input
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                disabled={!canEdit || uploading || saving}
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
            <div className={s.sectionTitle}>Workspace preview</div>
            <div className={s.preview} style={buildThemeStyle(theme)}>
              <div className={s.previewShell}>
                <aside className={s.previewSidebarPane}>
                  <div className={s.previewWorkspace}>{draft.displayName || business?.name || 'Workspace'}</div>
                  <span className={s.previewSidebarActive}>Dashboard</span>
                  <span className={s.previewSidebarLink}>Rota</span>
                  <span className={s.previewSidebarLink}>Leave</span>
                </aside>
                <div className={s.previewMain}>
                  <div className={s.previewTopline}>This week</div>
                  <div className={s.previewHeadline}>Team overview</div>
                  <div className={s.previewButton}>Publish schedule</div>
                  <div className={s.previewCardRow}>
                    <span className={s.previewInfoCard} />
                    <span className={s.previewInfoCard} />
                  </div>
                  <div className={s.previewTable}>
                    <div className={s.previewTableHead}><span>Request</span><span>Status</span></div>
                    <div className={s.previewTableRow}><span>Approved leave</span><span className={s.previewBadgeApproved}>Approved</span></div>
                    <div className={s.previewTableRow}><span>Pending review</span><span className={s.previewBadgePending}>Pending</span></div>
                    <div className={s.previewTableRow}><span>Declined request</span><span className={s.previewBadgeDeclined}>Declined</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        </details>

        {error && <div className={s.error}>{error}</div>}

        {canEdit && (
          <div className={s.footer}>
            {dirty && <span className={s.dirty}>Theme preview is live locally until you save or reset.</span>}
            <Button variant="ghost" onClick={reset} disabled={saving || uploading}>Reset</Button>
            <Button variant="primary" onClick={save} disabled={!dirty || saving || uploading}>{saving ? 'Saving…' : 'Save theme'}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
