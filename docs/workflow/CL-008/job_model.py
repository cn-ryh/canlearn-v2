"""CL-008 reference simulation only: no SQL, Temporal, GPU, HTTP or real billing."""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ACTIVE = {"QUEUED", "RUNNING", "WAITING_REVIEW"}
TERMINAL = {"PARTIAL_READY", "SUCCEEDED", "FAILED", "CANCELLED"}
TRANSITIONS = {
    "QUEUED": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {"WAITING_REVIEW", *TERMINAL},
    "WAITING_REVIEW": {"RUNNING", *TERMINAL},
    **{state: set() for state in TERMINAL},
}


class Rejected(Exception):
    """A machine-readable simulated rejection, never a provider error dump."""


@dataclass
class Job:
    status: str = "QUEUED"
    revision: int = 1
    epoch: int = 1
    snapshot: tuple[int, int, int] = (1, 1, 1)
    requested: list[int] = field(default_factory=lambda: [1])
    pages: dict[int, str] = field(default_factory=dict)
    results: set[int] = field(default_factory=set)
    publication_keys: set[str] = field(default_factory=set)
    cancel_requested: bool = False
    failure: str | None = None
    retryable: bool = False
    parent_job: str | None = None
    admissions: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class Model:
    source_revision: int = 1
    access_revision: int = 1
    rights_revision: int = 1
    blocked: bool = False
    purpose_allowed: bool = True
    restore_isolated: bool = False
    deletion_watermark: int = 0
    jobs: dict[str, Job] = field(default_factory=dict)
    requests: dict[tuple[str, str], tuple[str, str]] = field(default_factory=dict)
    outbox: list[dict[str, Any]] = field(default_factory=list)
    sent: set[str] = field(default_factory=set)
    deliveries: list[str] = field(default_factory=list)
    consumed: set[tuple[str, str]] = field(default_factory=set)
    effects: set[tuple[str, str]] = field(default_factory=set)
    receipts: dict[tuple[str, str, str], int] = field(default_factory=dict)
    disputed: set[tuple[str, str, str]] = field(default_factory=set)
    calls: int = 0
    executor_busy: bool = False
    backups: dict[str, Any] = field(default_factory=dict)

    @property
    def snapshot(self) -> tuple[int, int, int]:
        return self.source_revision, self.access_revision, self.rights_revision

    def emit(self, kind: str, job_id: str, revision: int) -> None:
        self.outbox.append(
            {
                "id": f"E{len(self.outbox) + 1}",
                "kind": kind,
                "job": job_id,
                "revision": revision,
            }
        )

    def transition(self, job_id: str, target: str) -> None:
        job = self.jobs[job_id]
        if target not in TRANSITIONS[job.status]:
            raise Rejected("INVALID_TRANSITION")
        job.status = target
        job.revision += 1
        if target in TERMINAL:
            self.emit("job.finalized.v1", job_id, job.revision)

    def current(self, job: Job) -> None:
        if self.blocked or self.restore_isolated or not self.purpose_allowed:
            raise Rejected("SOURCE_BLOCKED")
        if job.snapshot != self.snapshot:
            raise Rejected("SNAPSHOT_CONFLICT")
        if job.status not in ACTIVE or job.cancel_requested:
            raise Rejected("JOB_CLOSED")

    def cost_state(self, job: Job) -> str:
        if any(key[0] == self.job_id(job) for key in self.disputed):
            return "unknown_pending_reconciliation"
        if any(
            a["state"] in {"dispatch_intent", "unknown"}
            for a in job.admissions.values()
        ):
            return "unknown_pending_reconciliation"
        if any(a["state"] == "observed" for a in job.admissions.values()):
            return "observed"
        return "reserved"

    def job_id(self, job: Job) -> str:
        return next(name for name, value in self.jobs.items() if value is job)

    def apply(self, action: dict[str, Any]) -> None:
        """Each action is one abstract authority transaction or external observation."""
        op = action["op"]
        jid = action.get("job", "J1")
        if op == "publish_and_finish":
            before = copy.deepcopy((self.jobs, self.outbox))
            try:
                self.apply({**action, "op": "publish"})
                self.apply({"op": "finish", "job": jid})
                if action.get("crash_before_commit"):
                    self.jobs, self.outbox = before
            except Exception:
                self.jobs, self.outbox = before
                raise
            return
        if op == "submit":
            if self.blocked or self.restore_isolated or not self.purpose_allowed:
                raise Rejected("SOURCE_BLOCKED")
            scope = action.get("scope", "space-A/actor-A/parse/source-A")
            key = action.get("key", "request-A")
            fingerprint = json.dumps(
                [
                    action.get("pages", [1]),
                    action.get("params", "basic-v1"),
                    action.get("source_version", "source-A-v1"),
                    action.get("parent"),
                ],
                sort_keys=True,
            )
            previous = self.requests.get((scope, key))
            if previous:
                if previous[1] != fingerprint:
                    raise Rejected("IDEMPOTENCY_CONFLICT")
                return
            if jid in self.jobs:
                raise Rejected("DUPLICATE_JOB_ID")
            parent = action.get("parent")
            if parent:
                old = self.jobs[parent]
                if old.status not in {"FAILED", "PARTIAL_READY"} or not old.retryable:
                    raise Rejected("RETRY_NOT_ALLOWED")
                if self.cost_state(old) == "unknown_pending_reconciliation":
                    raise Rejected("RECONCILIATION_REQUIRED")
            pages = action.get("pages", [1])
            if not pages or len(pages) != len(set(pages)) or any(p < 1 for p in pages):
                raise Rejected("PAGE_RANGE_INVALID")
            self.jobs[jid] = Job(
                snapshot=self.snapshot, requested=pages, parent_job=parent
            )
            self.requests[scope, key] = jid, fingerprint
            self.emit("job.accepted.v1", jid, 1)
            return
        if op == "invalidate":
            reason = action["reason"]
            if reason == "corrected":
                self.source_revision += 1
            elif reason == "access_revoked":
                self.access_revision += 1
                self.purpose_allowed = False
            elif reason == "withdrawn":
                self.rights_revision += 1
                self.purpose_allowed = False
            elif reason == "deleted":
                if self.blocked:
                    return
                self.blocked = True
                self.deletion_watermark += 1
                self.access_revision += 1
                for name, job in self.jobs.items():
                    if job.status in ACTIVE:
                        self.apply({"op": "cancel", "job": name})
            else:
                raise Rejected("INVALID_REASON")
            self.emit("resource.invalidated.v1", "source-A", sum(self.snapshot))
            return
        if op == "backup":
            self.backups[action.get("name", "B1")] = copy.deepcopy(
                (self.jobs, self.source_revision, self.access_revision, self.blocked)
            )
            return
        if op == "restore":
            self.jobs, self.source_revision, self.access_revision, self.blocked = (
                copy.deepcopy(self.backups[action.get("name", "B1")])
            )
            self.restore_isolated = True
            return
        if op == "apply_deletion_ledger":
            if not action.get("available", True):
                raise Rejected("LATEST_LEDGER_REQUIRED")
            if self.deletion_watermark:
                self.blocked = True
                self.access_revision += 1
                for name, job in self.jobs.items():
                    if job.status in ACTIVE:
                        self.apply({"op": "cancel", "job": name})
            # Opening would also require real access/fee reconciliation; model only checks deletion.
            self.restore_isolated = False
            return
        if op == "dispatch":
            for event in self.outbox:
                if event["id"] not in self.sent:
                    self.deliveries.append(event["id"])
                    if action.get("crash_after_send"):
                        return
                    self.sent.add(event["id"])
            return
        if op == "consume":
            consumer = action.get("consumer", "workflow-starter-v1")
            for event_id in self.deliveries:
                pair = consumer, event_id
                if pair in self.consumed:
                    continue
                if action.get("crash_before_commit"):
                    # Effect + dedup marker both roll back in the abstract transaction.
                    return
                self.effects.add(pair)
                self.consumed.add(pair)
            return
        if op in {"restart_worker", "lease_expired"}:
            # Neither changes business authority, unknown calls or physical executor occupancy.
            return
        if op == "confirm_stopped":
            self.executor_busy = False
            return
        job = self.jobs[jid]
        if op == "start":
            self.current(job)
            self.transition(jid, "RUNNING")
        elif op == "wait_review":
            self.current(job)
            self.transition(jid, "WAITING_REVIEW")
        elif op == "approve":
            self.current(job)
            self.transition(jid, "RUNNING")
        elif op == "admit":
            self.current(job)
            if job.status != "RUNNING":
                raise Rejected("NOT_RUNNING")
            if self.cost_state(job) == "unknown_pending_reconciliation":
                raise Rejected("RECONCILIATION_REQUIRED")
            step = action.get("step", "parse:1")
            config = action.get("config", "config-v1")
            if step in job.admissions:
                if job.admissions[step]["config"] != config:
                    raise Rejected("ADMISSION_CONFLICT")
                return
            job.admissions[step] = {
                "epoch": job.epoch,
                "config": config,
                "state": "reserved",
            }
        elif op == "call":
            self.current(job)
            admission = job.admissions[action.get("step", "parse:1")]
            if admission["epoch"] != job.epoch:
                raise Rejected("ADMISSION_REVOKED")
            if admission["state"] != "reserved":
                raise Rejected("RECONCILIATION_REQUIRED")
            if self.executor_busy:
                raise Rejected("EXECUTOR_BUSY")
            admission["state"] = "dispatch_intent"
            self.calls += 1
            self.executor_busy = True
        elif op in {"timeout", "upstream_index_lost"}:
            admission = job.admissions[action.get("step", "parse:1")]
            admission["state"] = "unknown"
            if job.status in ACTIVE:
                job.failure = "UPSTREAM_UNKNOWN"
                job.retryable = False
                self.transition(jid, "FAILED")
        elif op == "usage":
            step = action.get("step", "parse:1")
            admission = job.admissions[step]
            receipt = jid, step, action.get("receipt", "receipt-A")
            amount = action[
                "units"
            ]  # Synthetic integer accounting units, not a RMB tariff.
            if receipt in self.receipts:
                if self.receipts[receipt] != amount:
                    self.disputed.add(receipt)
                    raise Rejected("USAGE_CONFLICT")
                return
            if amount < 0:
                raise Rejected("USAGE_INVALID")
            self.receipts[receipt] = amount
            admission["state"] = "observed"
        elif op == "publish":
            self.current(job)
            admission = job.admissions[action.get("step", "parse:1")]
            if (
                admission["epoch"] != action.get("epoch", 1)
                or job.epoch != admission["epoch"]
            ):
                raise Rejected("ADMISSION_REVOKED")
            if admission["state"] not in {"dispatch_intent", "observed"}:
                raise Rejected("NO_EXECUTION_EVIDENCE")
            if job.status != "RUNNING":
                raise Rejected("NOT_RUNNING")
            key = action.get("publication", "publication-A")
            pages = action.get("pages", {"1": "success"})
            statuses = {int(p): status for p, status in pages.items()}
            if set(statuses) != set(job.requested):
                raise Rejected("PAGE_MANIFEST_INCOMPLETE")
            if any(
                s not in {"success", "blank", "failed", "missing"}
                for s in statuses.values()
            ):
                raise Rejected("PAGE_STATE_INVALID")
            if key in job.publication_keys:
                if job.pages != statuses:
                    raise Rejected("PUBLICATION_CONFLICT")
                return
            if job.publication_keys:
                raise Rejected("RESULT_ALREADY_ADMITTED")
            job.pages = statuses
            job.results = {p for p, s in statuses.items() if s == "success"}
            job.publication_keys.add(key)
            job.revision += 1
        elif op == "finish":
            self.current(job)
            if job.status not in {"RUNNING", "WAITING_REVIEW"} or not job.pages:
                raise Rejected("NO_PAGE_MANIFEST")
            bad = any(s in {"failed", "missing"} for s in job.pages.values())
            job.retryable = bad
            self.transition(
                jid,
                "PARTIAL_READY"
                if bad and job.results
                else "FAILED"
                if bad
                else "SUCCEEDED",
            )
        elif op == "fail":
            if job.status not in ACTIVE:
                raise Rejected("JOB_CLOSED")
            job.failure = action.get("reason", "PERMANENT_ERROR")
            job.retryable = action.get("retryable", False)
            self.transition(jid, "FAILED")
        elif op == "cancel":
            if job.status in TERMINAL:
                return
            job.cancel_requested = True
            job.epoch += 1
            self.transition(jid, "CANCELLED")
            self.emit("job.cancel_requested.v1", jid, job.revision)
        else:
            raise ValueError(f"Unknown simulated operation {op}")

    def observe(self) -> dict[str, Any]:
        return {
            "jobs": {
                name: {
                    "status": job.status,
                    "epoch": job.epoch,
                    "cost_state": self.cost_state(job),
                    "failure": job.failure,
                    "publications": len(job.publication_keys),
                    "usable_pages": sorted(job.results),
                    "visible_pages": sorted(job.results)
                    if not self.blocked
                    and self.purpose_allowed
                    and not self.restore_isolated
                    and job.snapshot == self.snapshot
                    else [],
                    "page_states": {str(p): s for p, s in job.pages.items()},
                }
                for name, job in self.jobs.items()
            },
            "job_count": len(self.jobs),
            "calls": self.calls,
            "known_charge_units": sum(self.receipts.values()),
            "receipt_count": len(self.receipts),
            "disputed_count": len(self.disputed),
            "outbox_count": len(self.outbox),
            "delivery_count": len(self.deliveries),
            "effect_count": len(self.effects),
            "executor_busy": self.executor_busy,
            "blocked": self.blocked,
            "purpose_allowed": self.purpose_allowed,
            "restore_isolated": self.restore_isolated,
        }


def assert_subset(actual: Any, expected: Any, path: str = "result") -> None:
    if isinstance(expected, dict):
        for key, value in expected.items():
            assert key in actual, f"{path}.{key} missing"
            assert_subset(actual[key], value, f"{path}.{key}")
    else:
        assert actual == expected, f"{path}: expected {expected!r}, got {actual!r}"


def run_case(case: dict[str, Any]) -> dict[str, Any]:
    model = Model()
    rejections = []
    for action in case["actions"]:
        try:
            model.apply(action)
        except Rejected as exc:
            assert str(exc) == action.get("reject"), f"{case['id']}: unexpected {exc}"
            rejections.append(str(exc))
        else:
            assert "reject" not in action, (
                f"{case['id']}: expected rejection {action['reject']}"
            )
        if "expect" in action:
            assert_subset(model.observe(), action["expect"], case["id"])
    actual = model.observe()
    assert_subset(actual, case["expected"], case["id"])
    return {
        "id": case["id"],
        "passed": True,
        "rejections": rejections,
        "observed": actual,
    }


def main() -> None:
    root = Path(__file__).resolve().parent
    source = root / "scenarios.json"
    cases = json.loads(source.read_text())["cases"]
    results = [run_case(case) for case in cases]
    record = {
        "scope": "pure-memory reference simulation; no live SQL/Temporal/provider/recovery",
        "source_sha256": {
            name: hashlib.sha256((root / name).read_bytes()).hexdigest()
            for name in ["job_model.py", "scenarios.json"]
        },
        "passed": len(results),
        "results": results,
    }
    (root / "example-results.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"{len(results)} CL-008 reference scenarios passed")


if __name__ == "__main__":
    main()
