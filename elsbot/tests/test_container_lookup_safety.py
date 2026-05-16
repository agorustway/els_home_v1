import importlib.util
import os
import sys
import unittest
from unittest.mock import patch

ELSBOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(ELSBOT_DIR)
sys.path.append(ELSBOT_DIR)

from els_bot import (
    is_valid_container_no,
    parse_grid_text_to_rows,
    scrape_hyper_verify,
    make_status_row,
    is_retryable_result_rows,
    is_stale_grid_text,
)

KNOWN_VALID_CONTAINERS = [
    "MSKU5071276",
    "MNBU4288136",
    "MNBU4601277",
    "MNBU4659664",
    "MNBU4339444",
    "CAAU6199250",
    "CAAU9345893",
    "GAOU6513001",
    "CMAU8891299",
    "TRHU4510655",
    "ECMU7516146",
]


class FakePage:
    def __init__(self, grid_responses, inner_text=""):
        self.grid_responses = list(grid_responses)
        self.inner_text = inner_text
        self.html = inner_text

    def run_js(self, script):
        if "document.body.innerText" in script:
            return self.inner_text
        if "texts.join" in script:
            return self.inner_text
        if "gridContainer" in script:
            return ""
        if self.grid_responses:
            return self.grid_responses.pop(0)
        return ""


class TestContainerLookupSafety(unittest.TestCase):
    def test_iso6346_validates_known_good_and_mutated_bad_number(self):
        for cn in KNOWN_VALID_CONTAINERS:
            with self.subTest(container=cn):
                self.assertTrue(is_valid_container_no(cn))
                chars = list(cn)
                chars[6] = "0" if chars[6] != "0" else "1"
                self.assertFalse(is_valid_container_no("".join(chars)))

    def test_parser_keeps_only_history_rows_with_number_and_status(self):
        raw = "\n".join([
            "1|수입|반입|부산|2026-05-16 10:00|VESSEL||||40|KRPUS|CNSHA|12가1234|",
            "합계|이전 화면 잔상|버튼|메뉴",
            "2|수입|반출|인천|2026-05-16 11:00|VESSEL||||40|KRINC|CNSHA|34나5678|",
        ])
        rows = parse_grid_text_to_rows("MSKU5071276", raw)
        self.assertEqual([row[1] for row in rows], ["1", "2"])
        self.assertTrue(all(row[0] == "MSKU5071276" for row in rows))

    def test_empty_grid_is_pending_not_confirmed_nodata(self):
        page = FakePage([
            "GRID_EMPTY_PENDING",
            "GRID_EMPTY_PENDING",
            "1|수입|반입|부산|2026-05-16 10:00|VESSEL||||40|KRPUS|CNSHA|12가1234|",
        ])
        with patch("els_bot.time.sleep", return_value=None):
            result = scrape_hyper_verify(page, "MSKU5071276")
        self.assertIn("1|수입|반입", result)

    def test_scraper_default_waits_for_slow_real_grid_rows(self):
        page = FakePage(
            ["GRID_EMPTY_PENDING"] * 13 + [
                "1|수입|반입|부산|2026-05-16 10:00|VESSEL||||40|KRPUS|CNSHA|12가1234|"
            ]
        )
        with patch("els_bot.time.sleep", return_value=None):
            result = scrape_hyper_verify(page, "MSKU5071276")
        self.assertIn("1|수입|반입", result)

    def test_explicit_no_data_is_confirmed(self):
        page = FakePage(["GRID_EMPTY_PENDING"], inner_text="데이터가 없음")
        with patch("els_bot.time.sleep", return_value=None):
            result = scrape_hyper_verify(page, "MSKU5071276")
        self.assertEqual(result, "내역없음확인")

    def test_stale_grid_from_other_container_is_rejected(self):
        stale = "1|수출|적하|인천신국제여객터미널|2026-05-16 10:00|VESSEL||||40|KRPUS|CNSHA|12가1234|"

        self.assertTrue(is_stale_grid_text("ONEU6027330", stale, stale, "ONEU6027730"))
        self.assertFalse(is_stale_grid_text("ONEU6027330", stale, stale, "ONEU6027330"))

    def test_scraper_waits_out_unchanged_grid_before_accepting_rows(self):
        stale = "1|수출|적하|인천신국제여객터미널|2026-05-16 10:00|VESSEL||||40|KRPUS|CNSHA|12가1234|"
        page = FakePage([stale, stale])

        result = scrape_hyper_verify(
            page,
            "ONEU6027330",
            previous_grid_text=stale,
            previous_container_no="ONEU6027730",
            max_attempts=2,
            wait_interval=0,
        )

        self.assertEqual(result, "STALE_GRID_UNCHANGED")

    def test_retry_policy_retries_uncertain_errors_only(self):
        self.assertTrue(is_retryable_result_rows([make_status_row("MSKU5071276", "ERROR", "데이터 추출 실패 (시간 초과)")]))
        self.assertTrue(is_retryable_result_rows([make_status_row("ONEU6027330", "ERROR", "이전 조회 결과 잔상 감지")]))
        self.assertFalse(is_retryable_result_rows([make_status_row("MSKU5072276", "ERROR", "유효하지 않은 컨테이너 번호(ISO 6346 검증 실패)")]))
        self.assertFalse(is_retryable_result_rows([make_status_row("MSKU5071276", "NODATA", "내역 없음")]))

    def test_backend_order_helper_releases_completed_results_in_request_order(self):
        backend_dir = os.path.join(ROOT_DIR, "docker", "els-backend")
        sys.path.append(backend_dir)
        spec = importlib.util.spec_from_file_location("app_bot_for_test", os.path.join(backend_dir, "app_bot.py"))
        app_bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app_bot)

        pending = {
            1: {"cn": "MNB", "rows": [["MNB"]]},
            0: {"cn": "MSK", "rows": [["MSK"]]},
            3: {"cn": "CAA", "rows": [["CAA"]]},
        }
        ready, next_index = app_bot._pop_ready_ordered_results(pending, 0)
        self.assertEqual([item["cn"] for item in ready], ["MSK", "MNB"])
        self.assertEqual(next_index, 2)
        self.assertEqual(list(pending.keys()), [3])

    def test_backend_batch_workers_follow_live_driver_count_and_reserve_single(self):
        backend_dir = os.path.join(ROOT_DIR, "docker", "els-backend")
        sys.path.append(backend_dir)
        spec = importlib.util.spec_from_file_location("app_bot_for_worker_test", os.path.join(backend_dir, "app_bot.py"))
        app_bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app_bot)

        self.assertEqual(app_bot._effective_batch_workers({"total_drivers": 0, "max_drivers": 4}, configured_workers=4), 0)
        self.assertEqual(app_bot._effective_batch_workers({"total_drivers": 1, "max_drivers": 4}, configured_workers=4), 1)
        self.assertEqual(app_bot._effective_batch_workers({"total_drivers": 2, "max_drivers": 4}, configured_workers=4), 1)
        self.assertEqual(
            app_bot._effective_batch_workers({"total_drivers": 2, "max_drivers": 4}, configured_workers=4, reserve_single=False),
            2,
        )
        self.assertEqual(app_bot._effective_batch_workers({"total_drivers": 3, "max_drivers": 4}, configured_workers=4), 2)
        self.assertEqual(app_bot._effective_batch_workers({"total_drivers": 4, "max_drivers": 4}, configured_workers=4), 3)
        self.assertEqual(
            app_bot._effective_batch_workers({"total_drivers": 4, "max_drivers": 4}, configured_workers=4, reserve_single=False),
            4,
        )
        self.assertEqual(
            app_bot._effective_batch_workers({"total_drivers": 4, "available_drivers": 1, "max_drivers": 4}, configured_workers=4, reserve_single=False),
            1,
        )
        self.assertEqual(
            app_bot._effective_batch_workers({"total_drivers": 4, "available_drivers": 0, "max_drivers": 4}, configured_workers=4, reserve_single=False),
            0,
        )
        self.assertEqual(
            app_bot._effective_batch_workers({"total_drivers": 4, "available_drivers": 0, "max_drivers": 4}, configured_workers=4, reserve_single=False, in_flight=2),
            2,
        )

    def test_backend_batch_worker_config_is_bounded_to_at_least_one(self):
        backend_dir = os.path.join(ROOT_DIR, "docker", "els-backend")
        sys.path.append(backend_dir)
        spec = importlib.util.spec_from_file_location("app_bot_for_config_test", os.path.join(backend_dir, "app_bot.py"))
        app_bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app_bot)

        self.assertEqual(app_bot._configured_batch_workers(0), 1)
        self.assertEqual(app_bot._configured_batch_workers("bad"), 3)
        self.assertEqual(app_bot._configured_batch_workers(3), 3)

    def test_backend_retries_only_worker_or_uncertain_failures(self):
        backend_dir = os.path.join(ROOT_DIR, "docker", "els-backend")
        sys.path.append(backend_dir)
        spec = importlib.util.spec_from_file_location("app_bot_for_retry_test", os.path.join(backend_dir, "app_bot.py"))
        app_bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app_bot)

        self.assertTrue(app_bot._should_retry_rows([make_status_row("HPCU5082429", "ERROR", "WORKER_RETIRED: 메뉴 진입 실패")]))
        self.assertTrue(app_bot._should_retry_rows([make_status_row("HPCU5082429", "ERROR", "이전 조회 결과 잔상 감지")]))
        self.assertFalse(app_bot._should_retry_rows([make_status_row("HPCU5082429", "ERROR", "INPUT_NOT_FOUND (메뉴 진입 실패)")]))
        self.assertFalse(app_bot._should_retry_rows([make_status_row("MXXU7381060", "ERROR", "유효하지 않은 컨테이너 번호(ISO 6346 검증 실패)")]))


if __name__ == "__main__":
    unittest.main()
