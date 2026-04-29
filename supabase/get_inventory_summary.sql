-- Run this in the Supabase SQL editor.
-- Returns a single JSON object with the distinct filter values and quick counts
-- used by the Search Inventory page. Lets the page avoid loading every row of
-- item_variations just to populate the filter modal and stats.

create or replace function public.get_inventory_summary()
returns json
language sql
stable
security invoker
as $$
  select json_build_object(
    'sizes', coalesce(
      (select array_agg(value order by value)
         from (select distinct nullif(trim(size), '') as value
                 from public.item_variations
                where size is not null) s
        where value is not null),
      '{}'::text[]
    ),
    'colors', coalesce(
      (select array_agg(value order by value)
         from (select distinct nullif(trim(color), '') as value
                 from public.item_variations
                where color is not null) c
        where value is not null),
      '{}'::text[]
    ),
    'styles', coalesce(
      (select array_agg(value order by value)
         from (select distinct nullif(trim(style), '') as value
                 from public.item_variations
                where style is not null) st
        where value is not null),
      '{}'::text[]
    ),
    'total_variations', (select count(*) from public.item_variations),
    'unique_items_with_variations',
      (select count(distinct item_id) from public.item_variations)
  );
$$;

-- Allow authenticated and anon roles (client uses anon key) to call it.
grant execute on function public.get_inventory_summary() to anon, authenticated;
