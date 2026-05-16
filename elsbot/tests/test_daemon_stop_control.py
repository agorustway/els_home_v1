import importlib.util
import os
import sys
import types
import unittest


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


if __name__ == "__main__":
    unittest.main()
