export function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-2xl shadow-card p-4 ${accent ? 'bg-accent border border-transparent' : 'bg-surface border border-border'}`}>
      <p className={`text-xs ${accent ? 'text-on-accent/70' : 'text-text-muted'}`}>{label}</p>
      <p className={`text-xl font-bold font-display tracking-tight mt-1 ${accent ? 'text-on-accent' : 'text-text'}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${accent ? 'text-on-accent/70' : 'text-text-muted'}`}>{sub}</p>}
    </div>
  )
}
