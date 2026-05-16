import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from file_sync_gate import StableFileSyncGate


class TestStableFileSyncGate(unittest.TestCase):
    def test_waits_for_quiet_period_then_runs_once(self):
        gate = StableFileSyncGate(quiet_seconds=8, retry_seconds=60)
        sig = (1000.0, 2048)

        first = gate.check("dispatch:glovis", sig, now=10)
        self.assertFalse(first.ready)
        self.assertEqual(first.reason, "pending")

        settling = gate.check("dispatch:glovis", sig, now=17)
        self.assertFalse(settling.ready)
        self.assertEqual(settling.reason, "settling")

        ready = gate.check("dispatch:glovis", sig, now=18)
        self.assertTrue(ready.ready)
        self.assertEqual(ready.reason, "ready")

        gate.mark_synced("dispatch:glovis", sig, now=19)
        again = gate.check("dispatch:glovis", sig, now=100)
        self.assertFalse(again.ready)
        self.assertEqual(again.reason, "already-synced")

    def test_new_signature_resets_quiet_period(self):
        gate = StableFileSyncGate(quiet_seconds=8, retry_seconds=60)
        gate.check("shipping", (1000.0, 100), now=10)

        changed = gate.check("shipping", (1001.0, 120), now=15)
        self.assertFalse(changed.ready)
        self.assertEqual(changed.reason, "pending")

        still_settling = gate.check("shipping", (1001.0, 120), now=22)
        self.assertFalse(still_settling.ready)
        self.assertEqual(still_settling.reason, "settling")

        ready = gate.check("shipping", (1001.0, 120), now=23)
        self.assertTrue(ready.ready)

    def test_failed_attempt_is_throttled_until_retry_window(self):
        gate = StableFileSyncGate(quiet_seconds=0, retry_seconds=60)
        sig = (2000.0, 300)

        gate.check("shipping", sig, now=1)
        ready = gate.check("shipping", sig, now=2)
        self.assertTrue(ready.ready)

        retry_wait = gate.check("shipping", sig, now=30)
        self.assertFalse(retry_wait.ready)
        self.assertEqual(retry_wait.reason, "retry-wait")

        retry_ready = gate.check("shipping", sig, now=63)
        self.assertTrue(retry_ready.ready)

    def test_force_bypasses_quiet_period(self):
        gate = StableFileSyncGate(quiet_seconds=30, retry_seconds=60)
        decision = gate.check("dispatch:mobis", (3000.0, 400), now=5, force=True)
        self.assertTrue(decision.ready)
        self.assertEqual(decision.reason, "force")


if __name__ == "__main__":
    unittest.main()
