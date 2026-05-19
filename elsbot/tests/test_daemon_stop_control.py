import importlib.util
import os
import sys
import types
import unittest
from unittest.mock import patch


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ELSBOT_DIR = os.path.join(ROOT_DIR, "elsbot")
sys.path.append(ELSBOT_DIR)


def load_daemon_module():
    if "flask" not in sys.modules:
        flask = types.ModuleType("flask")

        class FakeFlask:
            def __init__(self, *args, **kwargs):
                pass

            def route(self, *args, **kwargs):
                def decorator(func):
                    return func
                return decorator

        flask.Flask = FakeFlask
        flask.request = types.SimpleNamespace(json={}, args={})
        flask.jsonify = lambda *args, **kwargs: {"args": args, "kwargs": kwargs}
        flask.Response = lambda *args, **kwargs: {"args": args, "kwargs": kwargs}
        flask.send_file = lambda *args, **kwargs: {"args": args, "kwargs": kwargs}
        sys.modules["flask"] = flask

    if "flask_cors" not in sys.modules:
        flask_cors = types.ModuleType("flask_cors")
        flask_cors.CORS = lambda *args, **kwargs: None
        sys.modules["flask_cors"] = flask_cors

    if "pandas" not in sys.modules:
        sys.modules["pandas"] = types.ModuleType("pandas")

    spec = importlib.util.spec_from_file_location(
        "els_web_runner_daemon_for_stop_test",
        os.path.join(ELSBOT_DIR, "els_web_runner_daemon.py"),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DummyDriver:
    def __init__(self, port=32000):
        self.used_port = port
        self.quit_count = 0

    def quit(self):
        self.quit_count += 1


class TestDaemonStopControl(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.daemon = load_daemon_module()

    def test_clear_invalidates_workers_and_rejects_late_driver(self):
        pool = self.daemon.DriverPool()
        cleaned_ports = []
        pool.cleanup_lingering_chrome = lambda port: cleaned_ports.append(port)
        driver = DummyDriver()
        self.assertTrue(pool.add_driver(driver))
        self.assertEqual(pool.available_queue.qsize(), 1)

        pool.is_logging_in = True
        pool.active_init_threads = 4
        old_generation = pool.generation
        pool.clear()

        self.assertTrue(pool.stop_requested.is_set())
        self.assertEqual(pool.generation, old_generation + 1)
        self.assertFalse(pool.is_logging_in)
        self.assertEqual(pool.active_init_threads, 0)
        self.assertEqual(pool.available_queue.qsize(), 0)
        self.assertEqual(pool.drivers, [])
        self.assertEqual(driver.quit_count, 1)
        self.assertEqual(cleaned_ports, [32000, 32001, 32002])

        late_driver = DummyDriver(32001)
        self.assertFalse(pool.add_driver(late_driver))
        self.assertEqual(pool.drivers, [])
        self.assertEqual(late_driver.quit_count, 1)

    def test_generation_change_cancels_wait_and_return_driver(self):
        pool = self.daemon.DriverPool()
        pool.cleanup_lingering_chrome = lambda port: None
        generation = pool.generation
        pool.generation += 1
        self.assertFalse(pool.wait_unless_cancelled(0, generation))

        driver = DummyDriver()
        pool.stop_requested.clear()
        self.assertTrue(pool.add_driver(driver))
        pool.available_queue.get_nowait()
        pool.stop_requested.set()
        pool.return_driver(driver)

        self.assertEqual(pool.available_queue.qsize(), 0)
        self.assertEqual(pool.drivers, [])
        self.assertEqual(driver.quit_count, 1)

    def test_retire_driver_removes_only_unhealthy_worker(self):
        pool = self.daemon.DriverPool()
        bad = DummyDriver(32000)
        good = DummyDriver(32001)
        self.assertTrue(pool.add_driver(bad))
        self.assertTrue(pool.add_driver(good))

        self.assertTrue(pool.retire_driver(bad, reason="test"))

        self.assertEqual(pool.drivers, [good])
        self.assertEqual(bad.quit_count, 1)
        self.assertEqual(good.quit_count, 0)
        queued = []
        while not pool.available_queue.empty():
            queued.append(pool.available_queue.get_nowait())
        self.assertEqual(queued, [good])

    def test_clear_cleans_configured_ports_even_when_pool_is_empty(self):
        with patch.dict(os.environ, {"ELS_MAX_DRIVERS": "2"}):
            pool = self.daemon.DriverPool()

        cleaned_ports = []
        pool.cleanup_lingering_chrome = lambda port: cleaned_ports.append(port)

        pool.clear()

        self.assertEqual(cleaned_ports, [32000, 32001])

    def test_return_driver_does_not_enqueue_duplicates(self):
        pool = self.daemon.DriverPool()
        driver = DummyDriver(32000)
        self.assertTrue(pool.add_driver(driver))

        pool.return_driver(driver)
        pool.return_driver(driver)

        self.assertEqual(pool.available_queue.qsize(), 1)

    def test_relogin_driver_can_be_registered_without_available_queue(self):
        pool = self.daemon.DriverPool()
        driver = DummyDriver(32000)

        self.assertTrue(pool.add_driver(driver, available=False))

        self.assertEqual(pool.drivers, [driver])
        self.assertEqual(pool.available_queue.qsize(), 0)

    def test_batch_can_use_worker_one_when_single_reservation_is_disabled(self):
        pool = self.daemon.DriverPool()
        first = DummyDriver(32000)
        second = DummyDriver(32001)
        third = DummyDriver(32002)
        pool.add_driver(first)
        pool.add_driver(second)
        pool.add_driver(third)

        reserved = pool.get_driver(timeout=1, purpose="batch", reserve_single=True)
        self.assertEqual(reserved, second)
        pool.return_driver(reserved)

        all_workers = pool.get_driver(timeout=1, purpose="batch", reserve_single=False)
        self.assertEqual(all_workers, first)

    def test_driver_pool_uses_configurable_init_stagger(self):
        with patch.dict(os.environ, {"ELS_DRIVER_STAGGER_SEC": "12.5"}):
            pool = self.daemon.DriverPool()

        self.assertEqual(pool.init_stagger_sec, 12.5)

    def test_driver_pool_uses_stagger_sequence_for_late_workers(self):
        with patch.dict(os.environ, {"ELS_DRIVER_STAGGER_SEC": "12.5", "ELS_DRIVER_STAGGER_SEQUENCE": "0,45,120,180"}):
            pool = self.daemon.DriverPool()

        self.assertEqual(pool.init_delay_for_idx(0), 0)
        self.assertEqual(pool.init_delay_for_idx(1), 45)
        self.assertEqual(pool.init_delay_for_idx(2), 120)
        self.assertEqual(pool.init_delay_for_idx(3), 180)
        self.assertEqual(pool.init_delay_for_idx(4), 50)

    def test_late_worker_waits_for_ready_base_workers(self):
        with patch.dict(os.environ, {
            "ELS_DRIVER_STAGGER_SEQUENCE": "0,0,0,0",
            "ELS_LATE_WORKER_MIN_READY": "2",
            "ELS_LATE_WORKER_SPACING_SEC": "7",
            "ELS_LATE_WORKER_READY_TIMEOUT_SEC": "0",
        }):
            pool = self.daemon.DriverPool()

        waited = []
        pool.wait_unless_cancelled = lambda sec, generation=None: waited.append(sec) or True

        self.assertTrue(pool.wait_for_init_slot(2, pool.generation))
        self.assertIn("[후행기동] 브라우저 #3 대기 초과", pool.log_buffer[-1])

        pool.add_driver(DummyDriver(32000))
        pool.add_driver(DummyDriver(32001))
        waited.clear()
        self.assertTrue(pool.wait_for_init_slot(3, pool.generation))
        self.assertEqual(waited, [7.0])

    def test_saved_credentials_prefers_environment_values(self):
        with patch.dict(os.environ, {"ELS_USER_ID": "ENVUSER", "ELS_USER_PW": "ENVPW"}, clear=False):
            with patch.object(self.daemon, "load_config", return_value={"user_id": "FILEUSER", "user_pw": "FILEPW"}):
                creds = self.daemon._saved_credentials()

        self.assertEqual(creds, {"user_id": "ENVUSER", "user_pw": "ENVPW", "source": "env"})

    def test_saved_warmup_reports_clear_error_without_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(self.daemon, "load_config", return_value={}):
                result = self.daemon._trigger_saved_warmup(source="test", wait_for_ready=False)

        self.assertFalse(result["ok"])
        self.assertIn("저장된 ETRANS 계정", result["error"])

    def test_start_login_pool_can_prepare_first_worker_without_page_visit(self):
        with patch.dict(os.environ, {"ELS_MAX_DRIVERS": "1"}):
            pool = self.daemon.DriverPool()
        pool.cleanup_lingering_chrome = lambda port: None

        def fake_login_and_prepare(*args, **kwargs):
            return (DummyDriver(32000), "ok")

        with patch.object(self.daemon, "pool", pool):
            with patch.object(self.daemon, "login_and_prepare", side_effect=fake_login_and_prepare):
                result = self.daemon._start_login_pool(
                    "ELSUSER",
                    "ELSPW",
                    wait_for_ready=True,
                    wait_timeout=2,
                    source="test",
                )

        self.assertTrue(result["ok"])
        self.assertEqual(pool.current_user["id"], "ELSUSER")
        self.assertEqual(len(pool.drivers), 1)
        pool.clear()

    def test_start_login_pool_force_restart_retries_after_menu_timeout(self):
        with patch.dict(os.environ, {"ELS_MAX_DRIVERS": "1"}):
            pool = self.daemon.DriverPool()
        pool.cleanup_lingering_chrome = lambda port: None
        pool.wait_unless_cancelled = lambda seconds, generation=None: True
        old_driver = DummyDriver(32000)
        pool.current_user = {"id": "ELSUSER", "pw": "OLDPW", "show_browser": False}
        pool.add_driver(old_driver)

        attempts = [
            (None, "메뉴 진입 최종 실패"),
            (DummyDriver(32000), None),
        ]

        def fake_login_and_prepare(*args, **kwargs):
            return attempts.pop(0)

        with patch.object(self.daemon, "pool", pool):
            with patch.object(self.daemon, "login_and_prepare", side_effect=fake_login_and_prepare) as login_mock:
                result = self.daemon._start_login_pool(
                    "ELSUSER",
                    "ELSPW",
                    wait_for_ready=True,
                    wait_timeout=2,
                    source="test",
                    force_restart=True,
                )

        self.assertTrue(result["ok"])
        self.assertEqual(login_mock.call_count, 2)
        self.assertEqual(old_driver.quit_count, 1)
        self.assertEqual(len(pool.drivers), 1)
        pool.clear()

    def test_daily_reset_uses_force_restart_warmup(self):
        pool = self.daemon.DriverPool()
        pool.current_user = {"id": "ELSUSER", "pw": "ELSPW", "show_browser": False}

        with patch.object(self.daemon, "pool", pool):
            with patch.object(self.daemon, "_start_login_pool", return_value={"ok": True}) as warmup_mock:
                result = self.daemon._daily_reset_once()

        self.assertTrue(result["ok"])
        warmup_mock.assert_called_once_with(
            "ELSUSER",
            "ELSPW",
            show_browser=False,
            wait_for_ready=False,
            source="daily-reset",
            force_restart=True,
        )


if __name__ == "__main__":
    unittest.main()
