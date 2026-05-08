"use client";

import { useFormStatus } from "react-dom";

export function SignInSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}
