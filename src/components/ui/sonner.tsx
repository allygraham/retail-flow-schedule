import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import s from './sonner.module.scss';
import { buildThemeStyle, useOptionalBranding } from '@/features/branding/brandingContext';
import { readableForeground } from '@/features/branding/contrast';
import { DEFAULT_THEME } from '@/features/branding/types';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ style, ...props }: ToasterProps) => {
  const branding = useOptionalBranding();
  const theme = branding?.theme ?? DEFAULT_THEME;
  const tokens = buildThemeStyle(theme);
  const toastStyle = { ...tokens, '--toast-foreground': readableForeground(tokens['--color-sidebar']), '--toast-action-foreground': theme.themeKey === 'topdrawer' ? '#ffffff' : readableForeground(tokens['--color-primary']), ...style };
  return (
  <Sonner
    theme="dark"
    position="top-right"
    offset={{ top: 24, right: 24 }}
    mobileOffset={{ top: 'calc(72px + env(safe-area-inset-top))', left: 16, right: 16 }}
    duration={6000}
    closeButton
    gap={12}
    visibleToasts={3}
    className={s.toaster}
    icons={{ success: <CircleCheck size={24} />, error: <CircleAlert size={24} />, warning: <TriangleAlert size={24} />, info: <Info size={24} />, close: <X size={18} /> }}
    toastOptions={{ classNames: { toast: s.toast, title: s.title, description: s.description, icon: s.icon, content: s.content, closeButton: s.close, actionButton: s.action, cancelButton: s.cancel } }}
    style={toastStyle}
    {...props}
  />
  );
};

export { Toaster };
