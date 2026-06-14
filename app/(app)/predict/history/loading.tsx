export default function Loading() {
  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="shimmer" style={{ height: 28, width: 180, borderRadius: 8 }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="shimmer" style={{ height: 100, borderRadius: 14 }} />
      ))}
    </div>
  );
}
