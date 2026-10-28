import type { ReactNode } from 'react';
export function SummaryCards({ items }: { items: { label: string; value: ReactNode; explanation?: string }[] }) {
  return <dl className="experiment-summary">{items.map(item => <div key={item.label}><dt>{item.label}{item.explanation && <span className="metric-help" tabIndex={0} title={item.explanation} aria-label={item.explanation}> ⓘ</span>}</dt><dd>{item.value}</dd></div>)}</dl>;
}
