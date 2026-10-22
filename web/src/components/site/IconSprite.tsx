// SVG icon sprite, generated from the v1 index.html (scripts kept the paths identical).
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-hot" viewBox="0 0 64 64">
          <path d="M24 6c-3 4 3 6 0 10M32 4c-3 4 3 6 0 10M40 6c-3 4 3 6 0 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M12 24h36v14a16 16 0 0 1-16 16h-4a16 16 0 0 1-16-16V24z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
          <path d="M48 28h3a7 7 0 0 1 0 14h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          <path d="M8 60h44" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </symbol>
        <symbol id="i-cold" viewBox="0 0 64 64">
          <path d="M36 4l-4 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          <path d="M14 18h36l-2 6H16z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
          <path d="M17 24l4 34h22l4-34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
          <rect x="24" y="32" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.2" transform="rotate(-12 27.5 35.5)"/>
          <rect x="33" y="38" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.2" transform="rotate(10 36.5 41.5)"/>
        </symbol>
        <symbol id="i-desserts" viewBox="0 0 64 64">
          <path d="M6 42c4-14 14-24 26-24s22 10 26 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          <path d="M6 42c8 6 44 6 52 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          <path d="M20 24c2 6 2 14 0 20M32 18v26M44 24c-2 6-2 14 0 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M14 54h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </symbol>
        <symbol id="i-pin" viewBox="0 0 24 24">
          <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2"/>
        </symbol>
        <symbol id="i-phone" viewBox="0 0 24 24">
          <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        </symbol>
        <symbol id="i-whatsapp" viewBox="0 0 24 24">
          <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M8.6 7.6c.3-.6.6-.6.9-.6h.6c.2 0 .5 0 .7.5l.9 2.1c.1.2.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .7a7 7 0 0 0 3.2 2.8c.3.1.5.1.7-.1l.8-.9c.2-.3.5-.3.8-.2l2 .9c.3.2.5.3.5.5 0 .6-.2 1.4-.9 1.9-.7.5-1.8.8-3.2.3a11 11 0 0 1-5.6-4.9c-.8-1.4-.8-2.6-.5-3.4z" fill="currentColor"/>
        </symbol>
        <symbol id="i-instagram" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>
        </symbol>
        <symbol id="i-up" viewBox="0 0 24 24">
          <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </symbol>
      </defs>
    </svg>
  );
}

export type IconName =
  | "hot" | "cold" | "desserts" | "search" | "x" | "pin" | "phone" | "whatsapp" | "instagram" | "up";

export function Icon({ name, className = "ico" }: { name: IconName | string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
