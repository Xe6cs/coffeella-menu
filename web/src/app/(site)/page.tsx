import { preload } from "react-dom";
import { CategoryCards } from "@/components/site/CategoryCards";
import { FloatingActions } from "@/components/site/FloatingActions";
import { MenuExplorer } from "@/components/site/MenuExplorer";
import { Hero, SiteFooter, SiteHeader, Topbar } from "@/components/site/SiteChrome";
import { getContactSettings, getPublishedMenu } from "@/lib/menu/repository";

// Static page, regenerated every hour or on demand when content is published.
export const revalidate = 3600;

export default async function MenuPage() {
  preload("/assets/hero.jpg", { as: "image" });
  const [menu, contact] = await Promise.all([getPublishedMenu(), getContactSettings()]);

  return (
    <>
      <a className="skip-link" href="#menu">
        تخطَّ إلى القائمة
      </a>
      <Topbar contact={contact} />
      <SiteHeader contact={contact} />
      <main>
        <Hero contact={contact} />
        <CategoryCards categories={menu.categories} />
        <MenuExplorer categories={menu.categories} />
      </main>
      <SiteFooter contact={contact} />
      <FloatingActions whatsappUrl={contact.whatsapp_url} />
    </>
  );
}
