export default function Loading() {
  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Hero card skeleton */}
      <div className="shimmer" style={{ height: 180, borderRadius: 16 }} />
      {/* Stat row */}
      <div style={{ display: "flex", gap: 10 }}>
        <div className="shimmer" style={{ flex: 1, height: 72, borderRadius: 12 }} />
        <div className="shimmer" style={{ flex: 1, height: 72, borderRadius: 12 }} />
      </div>
      {/* Cards */}
      {[1, 2, 3].map(i => (
        <div key={i} className="shimmer" style={{ height: 88, borderRadius: 14 }} />
      ))}
    </div>
  );
}
