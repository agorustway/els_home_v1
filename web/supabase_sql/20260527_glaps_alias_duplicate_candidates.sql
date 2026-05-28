-- GLAPS 항목매핑: 동일 ELS 매치코드에 복수 GLAPS 후보코드를 허용합니다.
-- 예: 라사로카르데나스 -> MXLZC / MXZLO 처럼 같은 배차판명에 여러 포트코드 후보가 필요할 때 사용.

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_key;

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_name_key;

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_name_route_code_key;

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_version_alias_source_route_code_key;

ALTER TABLE public.glaps_master_aliases
    ADD CONSTRAINT glaps_master_aliases_branch_version_alias_source_route_code_key
    UNIQUE (branch_id, version_id, alias_type, source_name, route_code, glaps_code);
