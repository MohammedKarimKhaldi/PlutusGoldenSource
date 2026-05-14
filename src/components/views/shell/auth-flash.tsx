import { Check } from "lucide-react";

export function AuthFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="data-notice success auth-flash" aria-live="polite">
      <Check size={16} />
      <span>Signed in successfully.</span>
    </div>
  );
}
