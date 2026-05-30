-- GLAPS 항목매핑: 기타 행을 검수메모 용도 기준으로 정식 매핑항목에 승격합니다.
-- 예: 검수메모=실출하지코드 + 최종코드(BP)=EAS 는 선사 EAS와 별도 항목으로 관리합니다.

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_alias_type_check;

ALTER TABLE public.glaps_master_aliases
    ADD CONSTRAINT glaps_master_aliases_alias_type_check
    CHECK (alias_type IN ('start', 'waypoint', 'destination', 'order_type', 'port', 'line', 'actual_unloading', 'container_type', 'carrier', 'consignee', 'generic'));

WITH discard_targets AS (
    SELECT id
    FROM public.glaps_master_aliases
    WHERE active
      AND replace(regexp_replace(coalesce(review_note, ''), '[[:space:]]+', '', 'g'), '，', ',') = '선사코드,실출하지코드'
)
UPDATE public.glaps_master_aliases aliases
SET active = false,
    updated_by = 'migration:20260530_glaps_alias_review_note_promotion'
FROM discard_targets
WHERE aliases.id = discard_targets.id;

WITH mapped AS (
    SELECT
        id,
        branch_id,
        version_id,
        source_name,
        route_code,
        glaps_code,
        CASE regexp_replace(coalesce(review_note, ''), '[[:space:]]+', '', 'g')
            WHEN '수출입코드' THEN 'order_type'
            WHEN '수출입' THEN 'order_type'
            WHEN '포트코드' THEN 'port'
            WHEN '포트' THEN 'port'
            WHEN '선사코드' THEN 'line'
            WHEN '선사' THEN 'line'
            WHEN '실출하지코드' THEN 'actual_unloading'
            WHEN '실출하지' THEN 'actual_unloading'
            WHEN '컨테이너규격' THEN 'container_type'
            WHEN '컨테이너' THEN 'container_type'
            WHEN '운송사코드' THEN 'carrier'
            WHEN '운송사' THEN 'carrier'
            WHEN '컨샤이니' THEN 'consignee'
            WHEN '컨사이니' THEN 'consignee'
            ELSE ''
        END AS target_alias_type
    FROM public.glaps_master_aliases
    WHERE active
      AND alias_type = 'generic'
),
conflicts AS (
    SELECT mapped.id
    FROM mapped
    JOIN public.glaps_master_aliases existing
      ON existing.branch_id = mapped.branch_id
     AND existing.version_id = mapped.version_id
     AND existing.alias_type = mapped.target_alias_type
     AND existing.source_name = mapped.source_name
     AND existing.route_code = mapped.route_code
     AND existing.glaps_code = mapped.glaps_code
     AND existing.active
     AND existing.id <> mapped.id
    WHERE mapped.target_alias_type <> ''
)
UPDATE public.glaps_master_aliases aliases
SET active = false,
    updated_by = 'migration:20260530_glaps_alias_review_note_promotion'
FROM conflicts
WHERE aliases.id = conflicts.id;

WITH mapped AS (
    SELECT
        id,
        CASE regexp_replace(coalesce(review_note, ''), '[[:space:]]+', '', 'g')
            WHEN '수출입코드' THEN 'order_type'
            WHEN '수출입' THEN 'order_type'
            WHEN '포트코드' THEN 'port'
            WHEN '포트' THEN 'port'
            WHEN '선사코드' THEN 'line'
            WHEN '선사' THEN 'line'
            WHEN '실출하지코드' THEN 'actual_unloading'
            WHEN '실출하지' THEN 'actual_unloading'
            WHEN '컨테이너규격' THEN 'container_type'
            WHEN '컨테이너' THEN 'container_type'
            WHEN '운송사코드' THEN 'carrier'
            WHEN '운송사' THEN 'carrier'
            WHEN '컨샤이니' THEN 'consignee'
            WHEN '컨사이니' THEN 'consignee'
            ELSE ''
        END AS target_alias_type
    FROM public.glaps_master_aliases
    WHERE active
      AND alias_type = 'generic'
)
UPDATE public.glaps_master_aliases aliases
SET alias_type = mapped.target_alias_type,
    updated_by = 'migration:20260530_glaps_alias_review_note_promotion'
FROM mapped
WHERE aliases.id = mapped.id
  AND mapped.target_alias_type <> '';
