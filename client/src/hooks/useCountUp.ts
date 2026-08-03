import { useEffect, useRef, useState } from 'react';

/**
 * Rolls a number up (or down) to its new value instead of snapping, so a pot
 * growing reads as chips arriving rather than a figure blinking.
 */
export function useCountUp(value: number, durationMs = 420): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (value - from) * eased);
      displayRef.current = current;
      setDisplay(current);
      if (progress < 1) frame = requestAnimationFrame(step);
      else displayRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}
