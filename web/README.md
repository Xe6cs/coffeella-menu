# Coffeella V2 — تطبيق الويب (`web/`)

تطبيق Next.js + TypeScript يعيد بناء قائمة كوفيلا بنفس الهوية، مع قاعدة بيانات Supabase.
الموقع الحالي (الإصدار الأول) يبقى في جذر المستودع ويُنشر من فرع `main` على GitHub Pages، ولا يتأثر بهذا المجلد.

## المتطلبات

- Node.js 20.9 أو أحدث (مُختبر على 24)
- npm

## التشغيل محلياً

```bash
cd web
npm install
npm run dev
```

ثم افتح http://localhost:3000.

بدون إعداد Supabase يعرض الموقع القائمة من الملف المرجعي `data/menu.v1.snapshot.json` (نسخة مطابقة للإصدار الأول). عند ضبط متغيرات Supabase يقرأ من قاعدة البيانات.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | بناء إنتاجي |
| `npm run start` | تشغيل البناء الإنتاجي |
| `npm run check` | فحص البيانات + TypeScript + ESLint + الاختبارات |
| `npm run test` | كل الاختبارات |
| `npm run test:db` | اختبارات قاعدة البيانات والصلاحيات (PGlite محلياً) |
| `npm run data:export` | إعادة توليد اللقطة المرجعية من `../menu-data.js` |
| `npm run data:seed` | إعادة توليد `supabase/seed.sql` من اللقطة |
| `npm run data:check` | التأكد أن اللقطة و`seed.sql` مطابقان للمصدر |

## البيانات

1. **المصدر الأصلي:** `../menu-data.js` (الإصدار الأول، لا يُعدَّل).
2. **اللقطة المرجعية:** `data/menu.v1.snapshot.json`. نسخة حرفية من الأسماء والأسعار والترتيب، مع معرّف ثابت (slug) لكل قسم ومجموعة ومنتج، وبصمة SHA-256 للمصدر.
3. **البيانات الأولية:** `supabase/seed.sql`، ويمكن إعادة تشغيلها بأمان: لا تكرر المنتجات، ولا تكتب فوق تعديلات الإدارة.

لم يُصحَّح أي نص أثناء الترحيل. التصحيحات اللغوية مرحلة منفصلة (انظر `../BASELINE_AUDIT.md`، القسم 5).

## قاعدة البيانات (Supabase)

الملفات في `supabase/`:

- `migrations/20261022000100_core_schema.sql`: الجداول والقيود والفهارس.
- `migrations/20261022000200_security.sql`: الصلاحيات، وسياسات RLS، والدوال الإدارية، وسجل التدقيق.
- `migrations/20261022000300_defaults_and_storage.sql`: الإعدادات الافتراضية، وقواعد الرفع، ومخازن الصور.
- `seed.sql`: القائمة الأصلية (3 أقسام، 9 مجموعات، 82 منتجاً).
- `tests/`: اختبارات الأمان على PostgreSQL محلي داخل Node (PGlite)، مع محاكاة لأدوار Supabase.

### الأدوار

| الدور | الصلاحيات |
|---|---|
| owner (مالك واحد فقط) | كل شيء، بما فيه إدارة المشرفين ونقل الملكية |
| admin | المنيو، المراجعات، المستخدمون والحظر، المحررون والمشرفون، الصفحات والنشر، الإعدادات، السجل |
| editor | المنيو، تحرير الصفحات (دون نشر)، رفع الصور |
| moderator | إخفاء المراجعات، عرض المستخدمين |

الصلاحيات تُفرض داخل قاعدة البيانات نفسها (RLS ودوال `SECURITY DEFINER` تتحقق من الصلاحية)، لا في الواجهة فقط.

### الإعداد على مشروع Supabase بعيد

1. أنشئ مشروعاً من https://supabase.com/dashboard (الخطة المجانية تكفي للتطوير).
2. طبّق ملفات `supabase/migrations/` بالترتيب، ثم `supabase/seed.sql`:
   - **إما** من SQL Editor في لوحة Supabase: انسخ كل ملف والصقه ونفّذه بالترتيب.
   - **أو** عبر Supabase CLI: `npx supabase link --project-ref <ref>` ثم `npx supabase db push`، ثم نفّذ `seed.sql` من SQL Editor.
3. انسخ `.env.example` إلى `.env.local` واملأ القيم من لوحة Supabase (Project Settings → API). **لا ترسل المفاتيح في المحادثات ولا ترفعها إلى Git.**
4. في Authentication → URL Configuration اضبط Site URL وRedirect URLs (مثل `http://localhost:3000/**` وعنوان المعاينة).

### الإعداد المحلي الكامل (اختياري)

يتطلب Docker Desktop: `npx supabase start`، ثم `npx supabase db reset` لتطبيق المايغريشن والبيانات. Docker غير مثبت على جهاز التطوير الحالي، لذلك تُختبر قاعدة البيانات عبر PGlite (`npm run test:db`).

### تهيئة المالك الأول بأمان

1. سجّل حساباً عادياً من الموقع بالبريد الذي سيكون للمالك، وأكّد البريد.
2. في Supabase → SQL Editor نفّذ (مرة واحدة فقط):

   ```sql
   select public.bootstrap_owner('owner@example.com');
   ```

الدالة لا يستطيع استدعاءها أي مستخدم من الموقع. تعمل فقط من SQL Editor أو بمفتاح الخدمة، وترفض التنفيذ إذا كان هناك مالك مسبقاً. بعدها يدير المالك بقية الأدوار من لوحة الإدارة، وتنتقل الملكية فقط عبر طلب نقل يقبله مشرف (admin) خلال 48 ساعة.

## متغيرات البيئة

| المتغير | عام/سري | المصدر |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عام | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | عام | Supabase → API Keys → Publishable key |
| `NEXT_PUBLIC_SITE_URL` | عام | عنوان الموقع المنشور |
| `SUPABASE_SECRET_KEY` | **سري** (الخادم فقط) | Supabase → API Keys → Secret key |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | عام | PostHog (مرحلة لاحقة) |

على Cloudflare تُضاف القيم السرية بالأمر `npx wrangler secret put SUPABASE_SECRET_KEY`، ولا تُكتب في `wrangler.jsonc`.

## النشر (Cloudflare — قيد الاختبار)

لم يُنفَّذ أي نشر. الإعداد جاهز لمعاينة منفصلة باسم `coffeella-v2-preview` غير مرتبطة بأي نطاق.

| الأمر | الوظيفة |
|---|---|
| `npm run cf:build` | بناء نسخة Workers عبر OpenNext (`.open-next/`) |
| `npm run cf:preview` | بناء وتشغيل محلي داخل بيئة Workers الحقيقية (workerd) |

### نتائج اختبار التوافق (2026-10-22، على Windows)

- **البناء:** OpenNext 1.20.13 مع Next.js 16.4.2 يبني بنجاح على Windows، مع تحذير رسمي بأن دعم Windows غير مضمون ويُفضَّل WSL.
- **الحجم:** الـ Worker بحجم 1.10 MiB بعد الضغط، أي أقل من حد الخطة المجانية (3 MiB).
- **Cache Components:** مع `cacheComponents` و`use cache` توقفت الطلبات داخل workerd وأعادت 500، وظهر تحذير Next.js بأنه لا يضمن Cache Components مع `setTimeout` في Workers. جُرِّبت ذاكرة الأصول الثابتة (فشلت: "Composable cache is not supported") وKV (استمر التوقف).
- **الحل المعتمد:** إيقاف Cache Components واستخدام النموذج التقليدي، أي ISR كل ساعة مع `unstable_cache` و`revalidateTag("menu")` عند النشر. في workerd: الصفحة تعيد 200 بكل المنتجات الـ82، و404 تعمل، والبحث والصور تعمل.
- **الذاكرة المؤقتة:** Workers KV (متاح في الخطة المجانية) لـ `incrementalCache` و`tagCache`، مع طابور في الذاكرة. KV متسق تدريجياً، لذا قد يستغرق ظهور التحديث بعد النشر حتى دقيقة تقريباً في كل المواقع.

### قبل أول نشر للمعاينة (يتطلب حسابك)

1. `npx wrangler login`
2. `npx wrangler kv namespace create NEXT_INC_CACHE_KV` و`npx wrangler kv namespace create NEXT_TAG_CACHE_KV`، ثم ضع المعرّفين بدل `REPLACE_WITH_…` في `wrangler.jsonc`.
3. أضف متغيرات البيئة العامة وقت البناء، والأسرار عبر `npx wrangler secret put`.
4. النشر `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` **فقط بعد موافقة صاحب المشروع.**
