# 아산지점 실적관리 파이프라인

> 작성일: 2026-05-17  
> 범위: 연간실적 1차 구축, 월별실적/합산실적 확장 계획

## 1. 목표
- NAS 아산지점 루트의 `B_총무\C_마감\합계연간실적\합계연간실적.xlsx` `합계` 탭을 백엔드에서 읽어 Supabase 원장으로 누적한다.
- 웹 `/employees/branches/asan` 안에 `실적관리` 메인 탭을 두고, 하위 `종합실적/월간실적/연간실적` 구조로 확장한다.
- 현재 연간실적 화면은 `실적관리 > 연간실적`에 배치하고, 분석 인포그래픽과 원장 테이블을 함께 제공한다.
- 제목행과 컬럼명은 엑셀 변경에 맞춰 동적으로 반영하며, 컬럼 추가/삭제도 현재 헤더 기준으로 수용한다.
- 원장 데이터는 물리 삭제하지 않고 현재 조회 대상만 `is_current`로 구분한다.

## 2. 현재 구현
- Next API: `/api/branches/asan/performance/annual`
  - `GET`: 기본 `source=supabase`로 Next 서버에서 Supabase 현재 원장 페이지 직접 조회
  - `GET source=excel`: 운영 점검용 NAS Excel 프리뷰, NAS Core 경유
  - `POST async=true`: NAS 엑셀 동기화를 백그라운드로 시작하고 현재 Supabase 조회값과 `sync_status` 반환
  - `POST async=false`: 운영 점검용 동기 처리
- NAS Core 모듈: `docker/els-backend/asan_performance.py`
- 직접 주입 도구: `web/scripts/import-asan-annual-performance.mjs`
  - NAS 동기화가 statement timeout에 걸릴 때 로컬 Excel을 Supabase 원장으로 직접 적재한다.
  - ExcelJS streaming reader로 대상 시트를 순차 파싱하고, 실제 주입은 읽는 중 100행 단위로 바로 반영해 NAS 메모리 점유를 낮춘다.
  - `마감월`은 `YYYY-MM`, `작업일자`는 `YYYY-MM-DD`로 저장하고 Excel 날짜 시리얼/ISO 시간 문자열을 정규화한다. `청구`/`하불` 등 금액 컬럼은 천단위 구분 표시값으로 저장한다.
  - 월 파서는 `YYYY-MM`, `YYYYMM`, `YYYY-MM-DD`, `YYYYMMDD`를 1~12월 범위로 엄격하게 읽는다. 특히 `2022-10/11/12`가 `2022-01`로 집계되지 않도록 월 정규식은 `1[0-2]|0?[1-9]` 순서를 유지한다.
  - summary에는 `currentSnapshotId`와 월별/구분별 breakdown을 저장한다. 웹 조회는 해당 snapshot만 읽어 중복 current 스냅샷 표시를 막는다.
  - 운영 기본값은 current 원장 전체 조회 없이 새 스냅샷을 staged 방식으로 insert한 뒤 메타 `currentSnapshotId`를 새 스냅샷으로 바꿔 공개한다. 이전 current 행 정리는 기본 성공 경로에서 제외해 statement timeout을 피한다.
  - 이전 current 행 정리가 필요할 때만 `--retire-previous-current`를 붙여 별도 수행한다.
  - staged 스냅샷을 복구 SQL로 공개한 뒤 분석 summary만 최신화하려면 `--summary-only`를 사용한다. 이 모드는 행 insert/update 없이 Excel을 스트리밍으로 읽고 `branch_performance_files.summary`만 갱신한다.
  - `file_modified_at`이 같으면 스킵하므로 일 1회 자동 실행 부담을 낮춘다.
  - 행별 hash 비교가 필요할 때만 `--diff-current`를 사용한다. 이 모드는 current 원장 조회 인덱스 상태에 민감하다.
  - 기본 실행: `node web/scripts/import-asan-annual-performance.mjs --file "/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx"`
  - 10만 행 초과 실제 주입은 dry-run 확인 후 `--confirm-large-import`를 붙여 실행한다.
  - 기본 실제 주입은 Supabase `file_modified_at`과 Excel mtime이 같으면 파싱 없이 스킵하며, 필요 시 `--force`로 강제한다.
  - 사전 점검: 위 명령에 `--dry-run`을 붙여 파싱 행 수와 감지 컬럼을 확인한다.
- NAS 일 1회 자동동기화 래퍼: `scripts/import-asan-annual-performance.sh`
  - 중복 실행 방지 lock을 잡고 직접 주입 스크립트를 호출한다.
  - 기본 chunk size는 100, `nice=10`, `ionice=2/7`로 낮은 우선순위에서 실행한다.
  - `ASAN_PERFORMANCE_CHUNK_SIZE`, `ASAN_PERFORMANCE_NICE`, `ASAN_PERFORMANCE_IONICE_CLASS`, `ASAN_PERFORMANCE_IONICE_LEVEL`로 조정 가능하다.
  - cron 예시: `0 3 * * * cd /volume1/docker/els_home_v1 && bash scripts/import-asan-annual-performance.sh >> logs/asan-annual-performance-cron.log 2>&1`
- 용량 영향:
  - 직접 주입은 Docker image/layer/cache를 만들지 않는다.
  - 남을 수 있는 것은 `web/node_modules` 설치분, cron 로그, Supabase DB 적재량이다.
  - NAS 확인 명령: `du -sh /volume1/docker/els_home_v1/web/node_modules /volume1/docker/els_home_v1/logs 2>/dev/null`
- 기본 파일 경로: `/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx`
- NAS 경로 탐색 기준: 배차판/선적관리와 동일하게 `/app/data/아산지점/...`
- 기존 `/B_총무/...` 저장값은 백엔드와 웹에서 `/아산지점/B_총무/...`로 자동 보정한다.
  - 기본 시트: `합계`
  - 제목행: 자동 감지, 웹 설정에서 수동 지정 가능
  - 파일 안정화 게이트: 저장 후 quiet time 경과 시 파싱
  - 자동 감지 기본 주기: 300초 (`ASAN_PERFORMANCE_SYNC_POLL_SECONDS`로 조정 가능)
- Supabase SQL: `web/supabase_sql/20260517_asan_annual_performance.sql`
  - `branch_performance_files`: 파일/헤더/요약 메타
  - `branch_performance_rows`: 누적 원장 행
  - `is_current=true`만 웹 현재 조회에 사용
  - current 조회 timeout 완화 보조 인덱스: `web/supabase_sql/20260517_asan_performance_current_lookup_index.sql`
  - snapshot 조회 보조 인덱스: `web/supabase_sql/20260517_asan_performance_snapshot_row_index.sql`
  - 실패한 staged 스냅샷 빠른 공개 SQL: `web/supabase_sql/20260517_asan_performance_recover_staged_snapshot.sql`
  - 월별 summary 복구 SQL: `web/supabase_sql/20260517_asan_performance_rebuild_monthly_summary_from_row_data.sql`
  - 10년 원장 분석 summary 재생성 SQL: `web/supabase_sql/20260517_asan_performance_rebuild_analytics_workbench_summary.sql`
- 웹 UI: `AsanAnnualPerformance`
  - 위치: `실적관리 > 연간실적`
  - 분석 하위 탭: `개요`, `10년 흐름`, `연도×월`, `직계약/차량`, `주차·요일`, `검증·근거`
  - 분석 축: 연간 성과 리포트, 손익 구조, 성과 경보, 연도별·월별 흐름, 연도×월 히트맵, 주차/요일 흐름, 검증/근거 설명
  - 회계 분석 축: 매출(`청구`), 매입(`하불`), 손익, 손익률, 매입률, 고객/작업지/운송사/노선/구분별 공헌도와 상위 집중도
  - `운송사(명의)=ELS솔루션`은 외부 운송사 비교 대상과 분리한다.
  - `ELS솔루션+직계약`은 우리 직계약차량 세그먼트로 별도 집계하고, 작업지/청구처/노선/구분 상세 버튼은 AND 검색으로 원장 테이블에 연결한다.
  - 차량별 손익은 실제 `영업넘버`만 랭킹으로 보여주며, 빈칸/`-` 영업넘버는 `차량번호 미기재` 품질 지표로 별도 표시한다.
  - 화면 분석은 Supabase summary/breakdown을 사용하며, 브라우저에서 36만 행 전체를 재집계하지 않는다.
  - 월별 흐름은 `summary.monthlyBasis`를 표시하고, 현재 운영 기준은 원본 `마감월`이다.
  - 테이블 탭: 검색, 정렬, 컬럼 숨김, 페이지 단위 더보기
  - 테이블 표시는 importer와 같은 날짜/금액 정규화 유틸을 사용한다.
  - 기본 조회는 Supabase exact count를 쓰지 않고 파일 메타 `current_row_count`를 전체 건수로 사용해 대용량 current 원장 count timeout을 피한다.

## 3. 데이터 처리 원칙
- 엑셀에서 행이 수정되면 기존 행은 `superseded_by_excel`로 종료하고 새 행을 추가한다.
- 엑셀에서 행이 사라져도 기존 행은 삭제하지 않는다. 기본 직접 주입은 파일 변경 시 새 스냅샷을 current로 올리고 직전 current 스냅샷을 종료한다.
- 행별 변경/삭제 상태가 꼭 필요하면 `--diff-current`로 기존 hash 비교 모드를 사용한다.
- 직접 주입 스크립트는 기존 원장을 물리 삭제하지 않고 `is_current`만 전환한다.
- 엑셀 제목만 바뀐 경우 웹 컬럼 레이아웃은 같은 인덱스 기준으로 최대한 복구한다.
- 컬럼이 추가/삭제된 경우 저장된 숨김/순서 설정보다 현재 엑셀 헤더를 우선한다.
- 화면 조회는 기본 300행 단위로 제한해 브라우저 메모리 부담을 낮춘다.
- 분석 탭에서 원장 상세로 이동할 때는 `search_mode=and`를 사용해 쉼표로 나눈 조건을 모두 포함하는 행만 조회한다.
- Supabase에 아직 적재 데이터가 없으면 `supabase-empty`와 `needs_sync=true`로 응답하며, 기본 조회가 Excel 파일을 직접 읽지 않는다.
- 최초 적재처럼 60초를 넘길 수 있는 작업은 화면 요청을 붙잡지 않고 백그라운드 작업으로 돌린 뒤 폴링한다.
- 직접 주입이 마지막 previous current 정리 단계에서 timeout 나면 이미 insert된 `staged_current` snapshot을 `20260517_asan_performance_recover_staged_snapshot.sql`로 공개한 뒤, 최신 웹 코드가 `currentSnapshotId` 기준으로 조회하게 한다.
- 월별 summary가 잘못 계산된 경우 원장 행을 재주입하지 않고 current snapshot의 `row_data->>'마감월'` 기준으로 `20260517_asan_performance_rebuild_monthly_summary_from_row_data.sql`을 실행해 복구한다.
- 분석 summary가 비어 있거나 구조가 바뀐 경우 `20260517_asan_performance_rebuild_analytics_workbench_summary.sql`을 실행한다. 운영 검증 기준은 current snapshot 368,617행, 월별 summary 불일치 0건, raw 재집계 차이 0원이다.

## 4. 월별실적 확장 계획
- 같은 `branch_performance_files/rows` 테이블을 `dataset_type='monthly'`로 재사용한다.
- 월별 마감자료는 연간실적보다 컬럼이 더 많은 원장으로 보고, 추가 컬럼은 `row_values/row_data`에 그대로 보존한다.
- 월별 페이지는 파일 여러 개 또는 폴더 단위 취합을 지원하도록 별도 sync endpoint를 만든다.
- 연간+월별 합산은 DB view 또는 백엔드 집계 API로 분리해 웹에서 전체 원장을 직접 합산하지 않는다.

## 5. TODO
- Supabase 운영 DB에 `20260517_asan_annual_performance.sql` 적용. (완료)
- NAS Core/Gateway 배포 후 화면의 `NAS 동기화`로 최초 백그라운드 동기화. timeout 발생 시 직접 주입 스크립트로 우회.
- 운영 NAS에서 `/app/data/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx` 존재 확인.
- 실제 엑셀 샘플 기준으로 매출/매입/손익 컬럼 자동 추론 키워드 보정.
- 연간실적 `year_value/month_value` 과거 오집계 행은 화면 summary에는 영향 없지만, 향후 DB 직접 분석용으로 별도 저부하 backfill SQL 검토.
- 월별실적 파일 위치와 마감자료 파일명 규칙 확정.
- 월별실적 페이지 제작 후 연간실적과 합산 API 설계.
