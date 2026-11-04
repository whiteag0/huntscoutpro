"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Submit button that asks before a consequential action and can't be double-clicked. */
export function ConfirmSubmit({
  children,
  confirm,
  className,
  formAction,
  pendingLabel,
}: {
  children: ReactNode;
  confirm?: string;
  className: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-wait`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
