-- GLAPS 특이적용건을 컨샤이니/화주사코드/상차지/상차지(청구) 정책으로 확장한다.
-- 적용 후 N084 + 현대제철 경유지는 컨테이너 상차지를 부산신항, 청구 상차지를 KRBNP로 기본 보정한다.

ALTER TABLE public.glaps_special_consignee_rules
    ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'consignee',
    ADD COLUMN IF NOT EXISTS start_location_name TEXT NOT NULL DEFAULT '';

UPDATE public.glaps_special_consignee_rules
SET rule_type = CASE
    WHEN COALESCE(start_location_name, '') <> '' THEN 'start_location'
    WHEN COALESCE(consignee_code, '') <> '' THEN 'consignee'
    ELSE 'shipper_code'
END
WHERE COALESCE(rule_type, '') = ''
   OR (rule_type = 'consignee' AND COALESCE(consignee_code, '') = '' AND COALESCE(start_location_name, '') = '');

DROP INDEX IF EXISTS public.uniq_glaps_special_consignee_rules_active;
CREATE UNIQUE INDEX uniq_glaps_special_consignee_rules_active
    ON public.glaps_special_consignee_rules (branch_id, rule_type, shipper_code, waypoint_name, waypoint_els_name)
    WHERE active;

DROP INDEX IF EXISTS public.idx_glaps_special_consignee_rules_lookup;
CREATE INDEX idx_glaps_special_consignee_rules_lookup
    ON public.glaps_special_consignee_rules (branch_id, rule_type, shipper_code, priority)
    WHERE active;

INSERT INTO public.glaps_special_consignee_rules (
    branch_id,
    rule_type,
    shipper_code,
    waypoint_name,
    waypoint_els_name,
    consignee_code,
    start_location_name,
    priority,
    review_note,
    active,
    created_by,
    updated_by
)
VALUES (
    'asan',
    'start_location',
    'N084',
    '',
    '현대제철',
    '',
    '부산신항',
    10,
    '현대제철 컨테이너 상차지 부산신항 우선적용',
    TRUE,
    'system:seed',
    'system:seed'
)
ON CONFLICT (branch_id, rule_type, shipper_code, waypoint_name, waypoint_els_name) WHERE active
DO UPDATE SET
    start_location_name = EXCLUDED.start_location_name,
    priority = EXCLUDED.priority,
    review_note = EXCLUDED.review_note,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

INSERT INTO public.glaps_special_consignee_rules (
    branch_id,
    rule_type,
    shipper_code,
    waypoint_name,
    waypoint_els_name,
    consignee_code,
    start_location_name,
    priority,
    review_note,
    active,
    created_by,
    updated_by
)
VALUES (
    'asan',
    'billing_start_location',
    'N084',
    '',
    '현대제철',
    '',
    'KRBNP',
    10,
    '현대제철 청구 상차지 KRBNP 우선적용',
    TRUE,
    'system:seed',
    'system:seed'
)
ON CONFLICT (branch_id, rule_type, shipper_code, waypoint_name, waypoint_els_name) WHERE active
DO UPDATE SET
    start_location_name = EXCLUDED.start_location_name,
    priority = EXCLUDED.priority,
    review_note = EXCLUDED.review_note,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
