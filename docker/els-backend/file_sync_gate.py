from dataclasses import dataclass
import time


@dataclass(frozen=True)
class SyncDecision:
    ready: bool
    reason: str


class StableFileSyncGate:
    """Debounce file-backed sync jobs using cheap mtime/size signatures."""

    def __init__(self, quiet_seconds=8, retry_seconds=60):
        self.quiet_seconds = max(0.0, float(quiet_seconds))
        self.retry_seconds = max(0.0, float(retry_seconds))
        self._states = {}

    def check(self, key, signature, now=None, force=False):
        now = time.time() if now is None else float(now)
        state = self._states.setdefault(key, {
            "pending_signature": None,
            "pending_since": 0.0,
            "synced_signature": None,
            "last_attempt_signature": None,
            "last_attempt_at": 0.0,
        })

        if force:
            state["last_attempt_signature"] = signature
            state["last_attempt_at"] = now
            return SyncDecision(True, "force")

        if signature is None:
            return SyncDecision(False, "missing-signature")

        if state["synced_signature"] == signature:
            return SyncDecision(False, "already-synced")

        if state["pending_signature"] != signature:
            state["pending_signature"] = signature
            state["pending_since"] = now
            return SyncDecision(False, "pending")

        if now - state["pending_since"] < self.quiet_seconds:
            return SyncDecision(False, "settling")

        if (
            state["last_attempt_signature"] == signature
            and now - state["last_attempt_at"] < self.retry_seconds
        ):
            return SyncDecision(False, "retry-wait")

        state["last_attempt_signature"] = signature
        state["last_attempt_at"] = now
        return SyncDecision(True, "ready")

    def mark_synced(self, key, signature, now=None):
        now = time.time() if now is None else float(now)
        state = self._states.setdefault(key, {
            "pending_signature": None,
            "pending_since": 0.0,
            "synced_signature": None,
            "last_attempt_signature": None,
            "last_attempt_at": 0.0,
        })
        state["synced_signature"] = signature
        state["pending_signature"] = None
        state["pending_since"] = 0.0
        state["last_attempt_signature"] = signature
        state["last_attempt_at"] = now
