import { ChevronDown } from "lucide-react";

export function FilterSelect({
  icon,
  value,
  onChange,
  label,
  options,
  optionValues,
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: readonly string[];
  optionValues?: readonly string[];
}) {
  return (
    <label className="select-filter">
      {icon}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option, index) => (
          <option key={optionValues?.[index] ?? option} value={optionValues?.[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
