# 데이터 보관 및 최적화 정책

> 기준일: 2026-05-31

## 현재 운영 기준
- Supabase는 화면 검색·조회에 필요한 **hot data**만 둔다.
- 원본 Excel, 장기 이력, 대량 일일자료, GPS 원본은 NAS를 **cold archive**로 본다.
- 보존 archive는 일반 검색 결과에 자동으로 섞지 않는다. 운영 검색은 hot DB 기준이며, archive는 별도 보존목록에서 찾고 필요 시 복원한다.
- DB에서 대량 삭제가 필요할 때는 먼저 NAS 압축 보관본을 만들고, 행 수와 해시 검증 후 삭제한다.
- 웹에서 생성된 데이터는 Excel 원본이 없으므로 반드시 archive 대상으로 본다. 대상은 배차확정/상세배차 수정, 배차변동, 차량 GPS, 사진·운행로그, 활동로그다.
- 인트라넷 문서 화면은 `/employees/data-retention`에서 제공하며, 배차판/실적/차량관제 화면의 `보존정책` 버튼으로 연결한다.

## 2026-05-31 정리 결과
- `branch_performance_rows`: 최신 연간 `currentSnapshotId`와 월간 `is_current` 행만 유지하도록 compact-swap 완료. 현재 약 730MB.
- `branch_dispatch_detail_change_history`: 사용자가 의미 있게 보는 이력만 유지하고 자동 `refreshed/resolved` 계열은 저장 차단. 현재 약 8MB.
- `document_chunks`: `VACUUM FULL` 후 IVFFLAT 인덱스 재생성. 현재 약 118MB.
- `branch_performance_monthly_route_unit_amount_cache`: 구간단가 화면용 캐시 신설. 원본 JSONB 재파싱 대신 5~6MB 캐시를 조회한다.
- 전체 DB 크기: 약 955MB.

## Hot / Warm / Cold 분리
| 구분 | 위치 | 대상 | 원칙 |
|---|---|---|---|
| Hot | Supabase | 화면이 즉시 조회하는 최신 상태, 최근 로그, current 원장 | 작게 유지하고 인덱스 최적화 |
| Warm | NAS 압축 보관 | 최근 1년 내 복구 가능성이 있는 Excel/JSONL/CSV | 월 단위 gzip/zip, manifest 기록 |
| Cold | NAS 장기 보관 | 법적/업무상 장기 확인용 원본 | 원본 파일 중심 보관, DB 재적재 가능성만 유지 |

## 테이블별 정책
| 대상 | Hot 보관 | 압축 보관 | 삭제 기준 |
|---|---:|---|---|
| `branch_performance_rows` | 최신 연간 스냅샷 + 월간 current | 연간/월간 원본 Excel NAS 보관 | 과거 스냅샷은 DB에 재누적하지 않음 |
| 구간단가 캐시 | 현재 월간 current 기준 캐시 | 없음 | import 후 재생성, stale 캐시는 truncate 후 rebuild |
| `branch_dispatch_detail_change_history` | 의미 이력만 상시 | 월별 JSONL 가능 | 자동 refresh/resolve는 저장 차단 |
| `user_activity_logs` | 180일 권장 | 월별 JSONL gzip | 1년 초과분 삭제 권장 |
| 차량 GPS raw 위치 | 90일 기본, 운영 필요 시 1년 1개월 | 운행 요약/일별 gzip | raw는 archive 검증 후 삭제 |
| 일일 배차 원장/상세 | 1년 1개월 | 월별 zip/jsonl.gz + manifest | hot 기간 초과분은 archive 검증 후 삭제 |
| 월간실적 current | 1년 3개월 | 원본 Excel NAS 보관 | 연간 확정 반영 후 오래된 월간 raw 삭제 |
| 연간실적 원장 | 2026년 이후 연도별 누적 추적, 최신 fix 스냅샷 | 원본 Excel NAS 보관 | 전체 재import 시 이전 스냅샷 archive 후 prune |
| `document_chunks` | 활성 RAG 문서만 | 원본 문서/NAS 인덱스 | 원본 삭제/교체 확인 후 stale chunk 제거 |

## 검색과 복원 원칙
- hot 기간 안의 데이터는 기존 화면 검색에서 바로 조회된다.
- hot 기간을 넘긴 archive 데이터는 기본 검색에서 바로 도출되지 않는다. 대신 보존목록에서 기간·테이블·업무키로 존재 여부를 찾고, 복원한 뒤 검색한다.
- archive 검색은 “자료가 존재하는지”를 찾는 catalog 검색이다. 운영 화면의 일반 검색처럼 원문 row를 바로 섞어 보여주지 않는다.
- 복원은 원본 테이블을 바로 오염시키지 않고 임시 복원 영역 또는 복원 batch id를 붙인 staging table에 적재한다.
- 복원 후 검증이 끝나면 필요한 기간만 운영 테이블로 승격하거나, 조회 전용 화면에서만 보여준다.
- 복원 데이터는 만료일을 둔다. 특별 사유가 없으면 7~30일 뒤 자동 삭제한다.

## 실적 데이터 운영 방침
- 월간실적은 1년 3개월 hot 보관한다. 1년치가 정리되면 연간실적으로 확정 반영한다.
- 연간실적은 fix 성격이다. 급한 정정 외에는 수정하지 않고, 2026년 자료부터 연도별 추적 기준으로 축적한다.
- 연간 파일 동기화는 DB 적재가 목적이므로 전체 스냅샷을 반복 누적하지 않는다. 변경·추가·삭제된 row만 반영하거나, 전체 재작성 시 이전 스냅샷을 archive 후 prune한다.
- import 후 구간단가 캐시는 재생성한다. 캐시는 원본이 아니므로 별도 보존하지 않는다.

## 일일데이터 삭제 판단
- 바로 삭제하지 않는다. 먼저 `월별 압축 보관 -> manifest 검증 -> 샘플 복원` 순서를 통과해야 한다.
- 화면에서 반복 조회하는 것은 요약/현재 상태 테이블로 남기고, 오래된 raw row는 NAS 압축본으로 내린다.
- 권장 1차 적용 범위는 “일일 배차/상세배차 1년 1개월 초과분”이다. 배차확정, GLAPS 코드, 사용자 수정 이력처럼 책임 추적이 필요한 데이터는 raw 삭제 전에 별도 요약/감사 테이블을 확인한다.

## 운영 절차
1. 월말 또는 주 1회 archive job이 대상 테이블을 `jsonl.gz` 또는 `csv.gz`로 NAS에 저장한다.
2. archive manifest에 테이블명, 기간, 행 수, 파일 크기, SHA-256, 생성 시각을 기록한다.
3. 복원 샘플 쿼리로 행 수와 기간을 검증한다.
4. 검증된 기간만 DB에서 삭제한다.
5. 대량 삭제 후 `ANALYZE`, 대형 삭제는 필요 시 `VACUUM FULL` 또는 compact-swap을 사용한다.

## 복원 기능 설계 메모
- `data_archive_manifest`: archive 파일 단위 메타. 테이블명, 기간, row count, SHA-256, NAS path, 생성자, 생성시각, 검증상태를 저장한다.
- `data_restore_jobs`: 복원 요청 단위. 요청자, 대상 기간, 대상 테이블, 상태, 복원 만료일, 결과 메시지를 저장한다.
- NAS archive path 권장: `/archive/db/{table_name}/yyyy/mm/{table_name}_{yyyy_mm}.jsonl.gz`.
- 복원 절차: manifest 선택 -> checksum 검증 -> staging 적재 -> row count 검증 -> 조회/승격 -> 만료 정리.
