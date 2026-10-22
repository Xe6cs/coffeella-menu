import type { CSSProperties } from "react";
import { itemsLabel } from "@/lib/menu/format";
import { photoUrl } from "@/lib/menu/mappers";
import type { MenuCategory } from "@/lib/menu/types";
import { Icon } from "./IconSprite";

const countProducts = (c: MenuCategory) => c.groups.reduce((n, g) => n + g.products.length, 0);

/** Category tiles with the original grey label box (v1 markup). */
export function CategoryCards({ categories }: { categories: MenuCategory[] }) {
  return (
    <section className="cats container" aria-label="الأقسام">
      <div className="cats__grid" id="cats">
        {categories.map((cat) => {
          const url = photoUrl(cat.photo);
          const style = url
            ? ({ "--photo": `url('${url}')`, ...(cat.photoFocus ? { "--focus": cat.photoFocus } : {}) } as CSSProperties)
            : undefined;
          return (
            <a key={cat.id} className={url ? "cat cat--photo" : "cat"} href={`#${cat.slug}`} style={style}>
              <span className="cat__count">{itemsLabel(countProducts(cat))}</span>
              <Icon name={cat.icon ?? "hot"} className="cat__icon" />
              <span className="cat__label">
                <span className="cat__ar">{cat.nameAr}</span>
                {cat.nameEn && (
                  <span className="cat__en" lang="en">
                    {cat.nameEn}
                  </span>
                )}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
