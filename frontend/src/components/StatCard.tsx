interface Props { label: string; value: string; detail: string; icon: string }
export function StatCard({ label, value, detail, icon }: Props) {
  return <article className="stat-card"><div className="stat-label">{label}<span aria-hidden="true">{icon}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}
