import { useEffect, useRef } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';

/**
 * Counts up to `value`. With reduced motion it shows the final number at once.
 * @param {{value: number, className?: string}} props
 */
export default function AnimatedNumber({ value, className = '' }) {
  const ref = useRef(null);
  const motionValue = useMotionValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reduce) {
      node.textContent = String(value);
      return undefined;
    }
    const unsubscribe = motionValue.on('change', (v) => {
      node.textContent = String(Math.round(v));
    });
    const controls = animate(motionValue, value, { duration: 0.8, ease: 'easeOut' });
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, reduce, motionValue]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
