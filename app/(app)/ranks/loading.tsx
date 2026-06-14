export default function Loading() {
  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 8 }} />
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="shimmer" style={{ height: 68, borderRadius: 12 }} />
      ))}
    </div>
  );
}
