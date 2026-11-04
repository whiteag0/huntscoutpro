import { Suspense } from "react";
import { adminLoginEnabled } from "@/lib/auth";
import { SignInForm } from "./SignInForm";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
        </div>
      }
    >
      <SignInForm adminLogin={adminLoginEnabled} />
    </Suspense>
  );
}
