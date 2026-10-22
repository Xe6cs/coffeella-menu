"use client";

/** Generic error screen: never shows internal error details to visitors. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container" style={{ padding: "96px 16px", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.6rem", margin: "0 0 12px" }}>تعذّر تحميل القائمة الآن</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>حاول مرة أخرى بعد قليل.</p>
      <button type="button" className="btn btn--accent" onClick={reset}>
        إعادة المحاولة
      </button>
    </main>
  );
}
