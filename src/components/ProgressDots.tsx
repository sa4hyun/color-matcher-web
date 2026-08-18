"use client";

import { LED_CHANNEL_HEX, LED_CHANNEL_NAMES } from "@/lib/types";

interface ProgressDotsProps {
  totalSteps: number;
  currentStep: number; // -1이면 아직 시작 전
}

/** 배경(회색) + LED 3색 진행 상태를 점으로 보여준다. */
export function ProgressDots({ totalSteps, currentStep }: ProgressDotsProps) {
  const colors = ["#94A3B8", ...LED_CHANNEL_NAMES.map((c) => LED_CHANNEL_HEX[c])];

  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: totalSteps }).map((_, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        const color = colors[i] ?? "#94A3B8";
        return (
          <div
            key={i}
            className="h-3.5 w-3.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: done || active ? color : "rgba(255,255,255,0.15)",
              boxShadow: active ? `0 0 14px 2px ${color}` : "none",
              transform: active ? "scale(1.3)" : "scale(1)",
            }}
          />
        );
      })}
    </div>
  );
}
