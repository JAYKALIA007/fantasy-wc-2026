export default function Loading() {
  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="shimmer" style={{ height: 32, width: 120, borderRadius: 8 }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="shimmer" style={{ height: 120, borderRadius: 14 }} />
      ))}
    </div>
  );
}
