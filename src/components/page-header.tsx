export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-medium tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-hairline bg-surface p-8 text-sm text-muted">
      {children}
    </div>
  );
}
