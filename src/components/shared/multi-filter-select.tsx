import { Check, ChevronDown, Filter } from "lucide-react";
import clsx from "clsx";

export function MultiFilterSelect({
  icon,
  label,
  options,
  selected,
  onToggle,
  formatOption = (value) => value,
}: {
  icon?: React.ReactNode;
  label: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  formatOption?: (value: string) => string;
}) {
  const selectedLabels = options.filter((option) => selected.has(option)).map(formatOption);
  const valueLabel =
    selectedLabels.length === 0
      ? "All"
      : selectedLabels.length > 2
        ? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
        : selectedLabels.join(", ");

  return (
    <details className={clsx("multi-filter", selected.size > 0 && "active")}>
      <summary>
        <span className="multi-filter-icon">{icon ?? <Filter size={15} />}</span>
        <span className="multi-filter-copy">
          <span>{label}</span>
          <strong>{valueLabel}</strong>
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="multi-filter-menu">
        <div className="multi-filter-menu-header">
          <span>{label}</span>
          <strong>{selected.size === 0 ? "All" : `${selected.size} selected`}</strong>
        </div>
        {options.map((option) => (
          <label key={option} className="multi-filter-option">
            <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} />
            <span className="multi-filter-check" aria-hidden="true">
              <Check size={13} />
            </span>
            <span>{formatOption(option)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
