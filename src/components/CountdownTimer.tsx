"use client";

import { useState, useEffect } from "react";

const TARGET_DATE = new Date("2026-04-30T23:59:59").getTime();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    function calc() {
      const now = Date.now();
      const diff = TARGET_DATE - now;
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      };
    }
    setTimeLeft(calc());
    const interval = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) {
    return (
      <div className="flex items-center justify-center gap-3 py-3">
        <div className="w-16 h-14 rounded-lg bg-white/5 animate-pulse" />
        <div className="w-16 h-14 rounded-lg bg-white/5 animate-pulse" />
        <div className="w-16 h-14 rounded-lg bg-white/5 animate-pulse" />
        <div className="w-16 h-14 rounded-lg bg-white/5 animate-pulse" />
      </div>
    );
  }

  const isUrgent = timeLeft.days < 7;

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hours" },
        { value: timeLeft.minutes, label: "Min" },
        { value: timeLeft.seconds, label: "Sec" },
      ].map((unit) => (
        <div key={unit.label} className="flex flex-col items-center">
          <div
            className={`w-14 sm:w-16 h-12 sm:h-14 rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold tabular-nums ${
              isUrgent
                ? "bg-danger/20 text-red-300 animate-pulse-soft"
                : "bg-white/10 text-gold"
            }`}
          >
            {pad(unit.value)}
          </div>
          <span className="text-[10px] sm:text-xs text-white/50 mt-1 uppercase tracking-wider">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}
