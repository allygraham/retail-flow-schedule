import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import s from './sonner.module.scss';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => (
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
    {...props}
  />
);

export { Toaster };
