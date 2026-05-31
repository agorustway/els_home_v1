# 데이터 보관 및 최적화 정책

> 기준일: 2026-05-31

## 현재 운영 기준
- Supabase는 화면 조회와 인증에 필요한 **hot data**만 둔다.
- 원본 Excel, 장기 이력, 대량 일일자료는 NAS를 **cold archive**로 본다.
- DB에서 대량 삭제가 필요할 때는 먼저 NAS 압축 보관본을 만들고, 행 수와 해시 검증 후 삭제한다.

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
| 차량 GPS raw 위치 | 90일 권장 | 운행 요약/일별 gzip | raw는 180~365일 후 삭제 권장 |
| 일일 배차 원장/상세 | 운영일 기준 최근 120일 권장 | 월별 zip + manifest | 180일 초과분은 archive 검증 후 삭제 검토 |
| `document_chunks` | 활성 RAG 문서만 | 원본 문서/NAS 인덱스 | 원본 삭제/교체 확인 후 stale chunk 제거 |

## 일일데이터 삭제 판단
- 바로 삭제하지 않는다. 먼저 `월별 압축 보관 -> manifest 검증 -> 샘플 복원` 순서를 통과해야 한다.
- 화면에서 반복 조회하는 것은 요약/현재 상태 테이블로 남기고, 오래된 raw row는 NAS 압축본으로 내린다.
- 권장 1차 적용 범위는 “일일 배차 raw 180일 초과분”이다. 배차확정, GLAPS 코드, 사용자 수정 이력처럼 책임 추적이 필요한 데이터는 raw 삭제 전에 별도 요약/감사 테이블을 확인한다.

## 운영 절차
1. 월말 또는 주 1회 archive job이 대상 테이블을 `jsonl.gz` 또는 `csv.gz`로 NAS에 저장한다.
2. archive manifest에 테이블명, 기간, 행 수, 파일 크기, SHA-256, 생성 시각을 기록한다.
3. 복원 샘플 쿼리로 행 수와 기간을 검증한다.
4. 검증된 기간만 DB에서 삭제한다.
5. 대량 삭제 후 `ANALYZE`, 대형 삭제는 필요 시 `VACUUM FULL` 또는 compact-swap을 사용한다.
