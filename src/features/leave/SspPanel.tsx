import s from './SspPanel.module.scss';
interface Props {
  startDate: string; endDate: string;
  history: { start_date: string; end_date: string; leave_type: string }[];
  paid?: boolean; employeeName?: string;
}
export function SspPanel(_props: Props) {
  return <div className={s.panel}>
    <div className={s.head}><span className={s.eyebrow}>Statutory Sick Pay</span></div>
    <p className={s.summary}>Calculate sick pay in your payroll system using the employee’s earnings, agreed qualifying days and sickness history. Lavoro does not calculate SSP.</p>
    <a href="https://www.gov.uk/guidance/statutory-sick-pay-manually-calculate-your-employees-payments" target="_blank" rel="noopener noreferrer">View current HMRC sick-pay guidance</a>
  </div>;
}
