"use client";

// Clears the "New" labels a moment after the page is shown (they stay visible on this view).
import { useEffect } from "react";
import { markAchievementsSeen } from "../actions";

export function MarkSeen() {
  useEffect(() => {
    const t = setTimeout(() => void markAchievementsSeen(), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
