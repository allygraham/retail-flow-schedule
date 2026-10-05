import s from './LoadingSkeleton.module.scss';

type Layout = 'page' | 'dashboard' | 'rota' | 'list' | 'balance' | 'inline' | 'form';
export function LoadingSkeleton({ layout = 'list', label = 'Loading content', rows = 3 }: { layout?: Layout; label?: string; rows?: number }) {
  const line = (width = '100%') => <div className={s.line} style={{ width }} />;
  const item = (key: number) => <div key={key} className={s.item}><div className={s.avatar} /><div className={s.copy}>{line('65%')}{line('40%')}</div></div>;
  const page = ['page', 'dashboard', 'rota'].includes(layout);
  return <div className={`${s.root} ${page ? s.page : ''}`} role="status" aria-label={label} aria-busy="true">
    <div aria-hidden="true">
      {page && <div className={s.heading}>{line('18%')}<div className={s.title} /><div className={s.toolbar}>{line('30%')}{line('20%')}</div></div>}
      {layout === 'inline' ? line('70%') : layout === 'balance' ? <><div className={s.stats}>{[0,1,2].map(i => <div key={i}>{line('65%')}<div className={s.value} /></div>)}</div>{line()}</> : layout === 'form' ? <div className={s.form}>{[0,1,2].map(i => <div key={i}>{line('35%')}<div className={s.input} /></div>)}</div> : layout === 'rota' ? <div className={s.rota}>{Array.from({length: 4}, (_, i) => <div key={i} className={s.rotaRow}><div className={s.copy}>{line('75%')}</div><div className={s.shift} /><div className={s.shift} /></div>)}</div> : <>
        {(layout === 'dashboard' || layout === 'page') && <div className={s.stats}>{[0,1,2].map(i => <div className={s.card} key={i}>{line('60%')}<div className={s.value} /></div>)}</div>}
        <div className={page ? s.card : ''}>{Array.from({length: rows}, (_, i) => item(i))}</div>
      </>}
    </div>
  </div>;
}
