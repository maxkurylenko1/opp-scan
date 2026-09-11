export default function ScoreBar({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div><div className="score-label"><span>{label}</span><strong>{safe.toFixed(0)}</strong></div><div className="bar"><span style={{ width: `${safe}%` }} /></div></div>;
}
