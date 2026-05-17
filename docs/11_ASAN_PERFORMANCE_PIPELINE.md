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
  - ExcelJS streaming reader로 대상 시트를 순차 파싱해 NAS 메모리 점유를 낮춘다.
  - 기본 실행: `node web/scripts/import-asan-annual-performance.mjs --file "/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx"`
  - 사전 점검: 위 명령에 `--dry-run`을 붙여 파싱 행 수와 감지 컬럼을 확인한다.
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
- 웹 UI: `AsanAnnualPerformance`
  - 위치: `실적관리 > 연간실적`
  - 분석 탭: 매출, 매입, 손익, 손익률, 연도별 그래프, 상위 거래처/구분
  - 테이블 탭: 검색, 정렬, 컬럼 숨김, 페이지 단위 더보기

## 3. 데이터 처리 원칙
- 엑셀에서 행이 수정되면 기존 행은 `superseded_by_excel`로 종료하고 새 행을 추가한다.
- 엑셀에서 행이 사라지면 기존 행은 `removed_from_excel`로 종료하되 삭제하지 않는다.
- 직접 주입 스크립트도 동일하게 기존 원장을 물리 삭제하지 않고 `is_current`만 전환한다.
- 엑셀 제목만 바뀐 경우 웹 컬럼 레이아웃은 같은 인덱스 기준으로 최대한 복구한다.
- 컬럼이 추가/삭제된 경우 저장된 숨김/순서 설정보다 현재 엑셀 헤더를 우선한다.
- 화면 조회는 기본 300행 단위로 제한해 브라우저 메모리 부담을 낮춘다.
- Supabase에 아직 적재 데이터가 없으면 `supabase-empty`와 `needs_sync=true`로 응답하며, 기본 조회가 Excel 파일을 직접 읽지 않는다.
- 최초 적재처럼 60초를 넘길 수 있는 작업은 화면 요청을 붙잡지 않고 백그라운드 작업으로 돌린 뒤 폴링한다.

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
- 월별실적 파일 위치와 마감자료 파일명 규칙 확정.
- 월별실적 페이지 제작 후 연간실적과 합산 API 설계.
