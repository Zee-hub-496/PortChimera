import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Short fade and rise on entry. Does nothing for people who asked for reduced motion. */
export default function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay }}
    >
      {children}
    </motion.div>
  );
}
