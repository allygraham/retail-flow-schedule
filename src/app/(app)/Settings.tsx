import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import s from './Stores.module.scss';

export default function Settings() {
  const { business, role } = useAuth();
  return (
    <div className={s.page}>
      <header className={s.header}><div><span className={s.eye}>Settings</span><h1 className={s.h1}>Workspace</h1></div></header>
      <Card title="Business">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <div><strong>Name:</strong> {business?.name}</div>
          <div><strong>Slug:</strong> {business?.slug}</div>
          <div><strong>Your role:</strong> <Badge tone="brand" dot>{role}</Badge></div>
        </div>
      </Card>
      <Card title="Coming soon" subtitle="Phase 2 & 3">
        <div style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          Drag-and-drop scheduling · recurring patterns · coverage heatmap · audit log UI · email invites · notifications · reporting · payroll export · billing.
        </div>
      </Card>
    </div>
  );
}
