export default function Loading() {
  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="shimmer" style={{ height: 28, width: 160, borderRadius: 8 }} />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="shimmer" style={{ height: 140, borderRadius: 16 }} />
      ))}
    </div>
  );
}
