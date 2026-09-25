export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="argus-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--aurora-1)" />
          <stop offset="55%" stopColor="var(--aurora-2)" />
          <stop offset="100%" stopColor="var(--aurora-3)" />
        </linearGradient>
      </defs>
      <path d="M2 16C6 9 10.5 6 16 6s10 3 14 10c-4 7-8.5 10-14 10S6 23 2 16Z" fill="none" stroke="url(#argus-logo)" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="url(#argus-logo)" />
      <circle cx="16" cy="16" r="2.2" fill="var(--background)" />
    </svg>
  );
}
