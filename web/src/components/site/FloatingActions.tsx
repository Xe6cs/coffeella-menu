"use client";

import { useEffect, useState } from "react";
import { Icon } from "./IconSprite";

/** WhatsApp button + back-to-top; both hide while scrolling down (v1 behaviour). */
export function FloatingActions({ whatsappUrl }: { whatsappUrl: string }) {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    let lastY = window.scrollY;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setShowTop(y >= 700);
        if (Math.abs(y - lastY) > 6) {
          document.body.classList.toggle("is-reading", y > lastY && y > 300);
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <a className="fab fab--wa" href={whatsappUrl} target="_blank" rel="noopener" aria-label="تواصل عبر واتساب">
        <Icon name="whatsapp" />
      </a>
      <button
        type="button"
        className="fab fab--up"
        aria-label="العودة للأعلى"
        hidden={!showTop}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <Icon name="up" />
      </button>
    </>
  );
}
