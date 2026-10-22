-- Coffeella V2 — default configuration and storage buckets.

-- Upload rules per purpose (raster images only; enforced again in the app by
-- checking the real file signature, and by the bucket limits below).
insert into public.upload_rules (purpose, bucket, allowed_mime_types, max_bytes, description_ar, description_en) values
  ('category_image', 'menu-images', array['image/jpeg', 'image/png', 'image/webp'], 3145728,
   'صورة بطاقة القسم', 'Category card image'),
  ('product_image', 'menu-images', array['image/jpeg', 'image/png', 'image/webp'], 2097152,
   'صورة المنتج', 'Product image'),
  ('page_image', 'page-images', array['image/jpeg', 'image/png', 'image/webp', 'image/avif'], 3145728,
   'صورة داخل صفحة من المحرر', 'Image inside an editor page')
on conflict (purpose) do nothing;

-- Public site settings copied from the v1 site (no secrets are ever stored here).
insert into public.site_settings (key, value, updated_by) values
  ('contact', jsonb_build_object(
     'address_ar', 'بغداد – حي الجامعة – فرع شركة كري الأرض الصلبة',
     'phone_display', '0787 001 0580',
     'phone_e164', '+9647870010580',
     'whatsapp_url', 'https://wa.me/9647870010580',
     'instagram_url', 'https://www.instagram.com/coffeella.cafe',
     'instagram_handle', '@coffeella.cafe'), null),
  ('theme', jsonb_build_object(
     'default_mode', 'dark',
     'allow_visitor_toggle', false,
     'accent', '#e0a35b'), null),
  ('transitions', jsonb_build_object('default', 'fade'), null)
on conflict (key) do nothing;

-- Storage buckets and policies exist only on Supabase (skipped in local tests).
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('menu-images', 'menu-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
    ('page-images', 'page-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "staff upload menu/page images" on storage.objects
      for insert to authenticated
      with check (bucket_id in ('menu-images', 'page-images') and (select public.has_permission('media.upload')))
  $p$;
  execute $p$
    create policy "staff update menu/page images" on storage.objects
      for update to authenticated
      using (bucket_id in ('menu-images', 'page-images') and (select public.has_permission('media.upload')))
  $p$;
  execute $p$
    create policy "staff delete menu/page images" on storage.objects
      for delete to authenticated
      using (bucket_id in ('menu-images', 'page-images') and (select public.has_permission('media.upload')))
  $p$;
end
$storage$;
