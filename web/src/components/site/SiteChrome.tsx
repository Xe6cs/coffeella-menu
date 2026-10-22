import Image from "next/image";
import type { ContactSettings } from "@/config/site";
import { SITE_NAV } from "@/config/site";
import { Icon } from "./IconSprite";

/** Announcement bar — same content as v1. */
export function Topbar({ contact }: { contact: ContactSettings }) {
  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <p className="topbar__info">
          <Icon name="pin" />
          <span>{contact.address_ar}</span>
        </p>
        <div className="topbar__actions">
          <a className="topbar__phone" href={`tel:${contact.phone_e164}`} dir="ltr">
            {contact.phone_display}
          </a>
          <a className="btn btn--ghost btn--sm" href={contact.whatsapp_url} target="_blank" rel="noopener">
            للاستفسار
          </a>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader({ contact }: { contact: ContactSettings }) {
  return (
    <header className="header">
      <div className="container header__inner">
        <a className="brand" href="#top" aria-label="Coffeella — الصفحة الرئيسية">
          <Image className="brand__logo" src="/brand.png" width={106} height={104} alt="شعار كوفيلا" unoptimized loading="eager" />
          <span className="brand__name" lang="en">
            coffeella menu
          </span>
        </a>
        <div className="header__end">
          <nav className="nav" aria-label="أقسام القائمة">
            {SITE_NAV.map((item) => (
              <a key={item.href} href={item.href} className="nav__link">
                {item.label}
              </a>
            ))}
          </nav>
          <a className="header__social" href={contact.instagram_url} target="_blank" rel="noopener" aria-label="كوفيلا على إنستغرام">
            <Icon name="instagram" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function Hero({ contact }: { contact: ContactSettings }) {
  return (
    <section className="hero">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__badge">
          <svg className="steam" viewBox="0 0 80 40" aria-hidden="true">
            <path d="M22 38c-6-8 6-12 0-20s6-12 0-18" />
            <path d="M40 38c-6-8 6-12 0-20s6-12 0-18" />
            <path d="M58 38c-6-8 6-12 0-20s6-12 0-18" />
          </svg>
          <Image src="/brand.png" width={106} height={104} alt="Coffeella Café — The Real Experience" unoptimized loading="eager" />
        </div>
        <p className="hero__eyebrow" lang="en">
          The Real Experience
        </p>
        <h1 className="hero__title">
          قائمة <span>كوفيلا</span>
        </h1>
        <p className="hero__lead">قهوة، مشروبات باردة، وحلويات ومخبوزات — اختر قسمك وابدأ التجربة.</p>
        <div className="hero__actions">
          <a className="btn btn--accent" href="#menu">
            تصفّح القائمة
          </a>
          <a className="btn btn--ghost" href={contact.whatsapp_url} target="_blank" rel="noopener">
            <Icon name="whatsapp" />
            للاستفسار
          </a>
        </div>
      </div>
    </section>
  );
}

// Rendered with the page (static, regenerated at least hourly).
function CurrentYear() {
  return <>{new Date().getFullYear()}</>;
}

export function SiteFooter({ contact }: { contact: ContactSettings }) {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Image src="/brand.png" width={106} height={104} alt="" unoptimized />
          <p lang="en">The Real Experience</p>
        </div>
        <ul className="footer__links">
          <li>
            <Icon name="pin" />
            {contact.address_ar}
          </li>
          <li>
            <Icon name="phone" />
            <a href={`tel:${contact.phone_e164}`} dir="ltr">
              {contact.phone_display}
            </a>
          </li>
          <li>
            <Icon name="whatsapp" />
            <a href={contact.whatsapp_url} target="_blank" rel="noopener">
              راسلنا على واتساب
            </a>
          </li>
          <li>
            <Icon name="instagram" />
            <a href={contact.instagram_url} target="_blank" rel="noopener" dir="ltr">
              {contact.instagram_handle}
            </a>
          </li>
        </ul>
      </div>
      <p className="footer__copy" lang="en">
        © <CurrentYear /> Coffeella Café
      </p>
    </footer>
  );
}
