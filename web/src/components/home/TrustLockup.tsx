export default function TrustLockup({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="rounded-md border border-[var(--tt-border)] px-3 py-2">
      <p className="font-data text-xs text-[var(--tt-faint)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--tt-text)]">{value}</p>
    </div>
  );
}
