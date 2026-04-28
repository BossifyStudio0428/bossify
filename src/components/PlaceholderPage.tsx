export function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="px-5 pt-12">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

      <div className="mt-8 rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-6 min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center">
          Coming soon ✨
        </p>
      </div>
    </div>
  );
}