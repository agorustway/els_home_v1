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

        late_driver = DummyDriver(32001)
        self.assertFalse(pool.add_driver(late_driver))
        self.assertEqual(pool.drivers, [])
        self.assertEqual(late_driver.quit_count, 1)

    def test_generation_change_cancels_wait_and_return_driver(self):
        pool = self.daemon.DriverPool()
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


if __name__ == "__main__":
    unittest.main()
