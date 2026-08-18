import { ReactNode } from "react";

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-glassBorder bg-glass p-5 backdrop-blur-xl shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}
