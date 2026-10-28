import { InfoTooltip } from '../InfoTooltip';
import type { ReactNode } from 'react';
export function SummaryCards({ items }: { items: { label: string; value: ReactNode; explanation?: string }[] }) {
  return <dl className="experiment-summary">{items.map(item => <div key={item.label}><dt>{item.label}{item.explanation && <InfoTooltip title={item.label} explanation={item.explanation}/>}</dt><dd>{item.value}</dd></div>)}</dl>;
}
