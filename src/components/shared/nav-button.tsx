import clsx from "clsx";

export function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={clsx("nav-item", active && "active")} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
