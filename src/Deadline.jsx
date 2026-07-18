import React, { useEffect, useState } from "react";
import { Clock, AlarmClock } from "lucide-react";

// Live-ticking countdown to a note's deadline. A minute cadence is plenty for
// a task board and keeps the timer cheap even with many notes on screen.
export function useCountdown(deadlineIso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineIso) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [deadlineIso]);
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).getTime() - now;
  return { overdue: ms < 0, soon: ms >= 0 && ms < 86_400_000, label: formatDelta(Math.abs(ms)) };
}

export function formatDelta(ms) {
  const mins = Math.round(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${Math.max(0, mins)}m`;
}

export default function Deadline({ deadlineIso }) {
  const c = useCountdown(deadlineIso);
  if (!c) return null;
  const cls = "deadline" + (c.overdue ? " overdue" : c.soon ? " soon" : "");
  const Icon = c.overdue ? AlarmClock : Clock;
  return (
    <span className={cls} title={"Due " + new Date(deadlineIso).toLocaleDateString()}>
      <Icon size={12} />
      {c.overdue ? `${c.label} overdue` : `${c.label} left`}
    </span>
  );
}
