"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the `prefers-reduced-motion` setting (docs/01 §4.5). CSS animations
 * are already disabled globally under this preference; this hook is for JS-driven
 * animation (e.g. Recharts) that a stylesheet can't reach.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
