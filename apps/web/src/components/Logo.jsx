// PortChimera mark: a compass ring with a needle and a route node. Same shapes as public/favicon.svg.
/**
 * @param {{size?: number, showWordmark?: boolean, className?: string}} props
 */
export default function Logo({ size = 28, showWordmark = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <rect width="64" height="64" rx="14" fill="#0b1f3a" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="#e6f1f5" strokeWidth="4" />
        <polygon points="32,13 38,32 26,32" fill="#22d3ee" />
        <polygon points="26,32 38,32 32,51" fill="#e6f1f5" />
        <circle cx="32" cy="32" r="3" fill="#0b1f3a" />
        <circle cx="47.5" cy="16.5" r="4" fill="#22d3ee" stroke="#0b1f3a" strokeWidth="1.5" />
      </svg>
      {showWordmark ? (
        <span className="text-lg font-extrabold tracking-tight text-fg">PortChimera</span>
      ) : (
        <span className="sr-only">PortChimera</span>
      )}
    </span>
  );
}
