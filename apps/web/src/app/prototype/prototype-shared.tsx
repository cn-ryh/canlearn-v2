export function StatusTag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`status-tag ${tone}`}>{children}</span>;
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="source-note">
      <span aria-hidden="true">↳</span> {children}
    </p>
  );
}
