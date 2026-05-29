-- 아산 연간실적 원장 식별번호 검색 인덱스 보강
-- 목적: current snapshot 행의 is_current 상태와 무관하게 컨테이너/씰/부킹/차량/전화번호 검색을 빠르게 처리한다.

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_annual_ctn
ON public.branch_performance_rows
((row_data->>'C/Tn'))
WHERE branch_id = 'asan'
  AND dataset_type = 'annual';

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_annual_seal
ON public.branch_performance_rows
((row_data->>'SEALn'))
WHERE branch_id = 'asan'
  AND dataset_type = 'annual';

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_annual_booking
ON public.branch_performance_rows
((row_data->>'BOOKINGNO-'))
WHERE branch_id = 'asan'
  AND dataset_type = 'annual';

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_annual_vehicle_no
ON public.branch_performance_rows
((row_data->>'영업넘버'))
WHERE branch_id = 'asan'
  AND dataset_type = 'annual';

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_annual_driver_phone
ON public.branch_performance_rows
((row_data->>'기사전화번호'))
WHERE branch_id = 'asan'
  AND dataset_type = 'annual';
