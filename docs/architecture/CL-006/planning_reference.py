"""Pure-memory R0 planning specification. No SQL locks, API authorization or real concurrency."""

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


class Conflict(ValueError):
    pass


PAYLOAD = (
    "occurrence_revision",
    "resource_version_ref",
    "purpose",
    "minutes",
    "window_start",
    "window_end",
)


def identity(task: dict) -> tuple[str, str]:
    return task["account"], task["occurrence_key"]


def instant(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.utcoffset() is None or parsed.microsecond:
        raise Conflict("UTC_INSTANT_REQUIRED")
    return parsed.astimezone(UTC)


def unique_tasks(tasks: list[dict]) -> list[dict]:
    unique = {}
    for task in tasks:
        if type(task["minutes"]) is not int or task["minutes"] <= 0:
            raise Conflict("INVALID_MINUTES")
        start, end = instant(task["window_start"]), instant(task["window_end"])
        if (end - start).total_seconds() != task["minutes"] * 60:
            raise Conflict("DURATION_MISMATCH")
        payload = tuple(task[field] for field in PAYLOAD)
        key = identity(task)
        if key in unique and tuple(unique[key][field] for field in PAYLOAD) != payload:
            raise Conflict("OCCURRENCE_PAYLOAD_CONFLICT")
        unique.setdefault(key, task)
    return list(unique.values())


def usage(tasks: list[dict], timezone: str, account: str) -> dict[str, int]:
    """Charge actual UTC seconds to local days and Monday-based weeks; never round per slice."""
    zone, totals = ZoneInfo(timezone), {}
    ordered = sorted(
        unique_tasks(tasks), key=lambda task: instant(task["window_start"])
    )
    previous_end = None
    for task in ordered:
        if task["account"] != account:
            raise Conflict("ACCOUNT_MISMATCH")
        cursor, end = instant(task["window_start"]), instant(task["window_end"])
        if previous_end is not None and cursor < previous_end:
            raise Conflict("OVERLAPPING_TASKS")
        previous_end = end
        while cursor < end:
            day = cursor.astimezone(zone).date()
            boundary = datetime.combine(
                day + timedelta(days=1), time.min, zone
            ).astimezone(UTC)
            stop = min(end, boundary)
            if stop <= cursor:
                raise Conflict("CALENDAR_BOUNDARY_INVALID")
            seconds = int((stop - cursor).total_seconds())
            for key in (f"day:{day}", f"week:{day - timedelta(days=day.weekday())}"):
                totals[key] = totals.get(key, 0) + seconds
            cursor = stop
    return totals


def budget_limits(rows: list[dict]) -> dict[str, int]:
    limits = {}
    for row in rows:
        key = row["period"]
        try:
            kind, label = key.split(":", 1)
            start = date.fromisoformat(label)
        except ValueError as error:
            raise Conflict("BUDGET_PERIOD_INVALID") from error
        if (
            kind not in ("day", "week")
            or label != start.isoformat()
            or (kind == "week" and start.weekday() != 0)
        ):
            raise Conflict("BUDGET_PERIOD_INVALID")
        if key in limits:
            raise Conflict("BUDGET_PERIOD_CONFLICT")
        if type(row["minutes"]) is not int or row["minutes"] < 0:
            raise Conflict("INVALID_BUDGET")
        limits[key] = row["minutes"] * 60
    return limits


def admit(
    protected: list[dict], future: list[dict], limits: dict[str, int], timezone: str
) -> dict:
    """Completed/started charges survive replacement. Shrink may leave a visible historical overage."""
    protected_ids = {identity(task) for task in protected}
    if any(identity(task) in protected_ids for task in future):
        raise Conflict("PROTECTED_OCCURRENCE")
    used = usage(protected, timezone, "U-A")
    requested = usage(future, timezone, "U-A")
    usage(
        protected + future, timezone, "U-A"
    )  # Check overlap across protected/future rows too.
    for period, limit in limits.items():
        if requested.get(period, 0) > max(0, limit - used.get(period, 0)):
            raise Conflict("CAPACITY_CONFLICT")
    return {
        "protected_seconds": used,
        "future_seconds": requested,
        "overcommitted": sorted(
            key for key, limit in limits.items() if used.get(key, 0) > limit
        ),
    }


def confirm(state: dict, base: int, request_key: str, payload: dict) -> int:
    """Sequential interleaving model of one atomic compare-and-swap; NOT a SQL concurrency test."""
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    old = state["requests"].get(request_key)
    if old:
        if old["digest"] != digest:
            raise Conflict("REQUEST_KEY_CONFLICT")
        return old["revision"]
    if base != state["revision"]:
        raise Conflict("VERSION_CONFLICT")
    next_revision = base + 1
    state["requests"][request_key] = {"digest": digest, "revision": next_revision}
    state["revision"] = next_revision
    return next_revision


def complete(facts: dict, task: dict) -> None:
    key, payload = identity(task), tuple(task[field] for field in PAYLOAD)
    if key in facts and facts[key] != payload:
        raise Conflict("COMPLETION_PAYLOAD_CONFLICT")
    facts.setdefault(key, payload)
