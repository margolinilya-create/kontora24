export function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
