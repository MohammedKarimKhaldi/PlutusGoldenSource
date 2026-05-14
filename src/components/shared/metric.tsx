import clsx from "clsx";

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={clsx("metric", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
