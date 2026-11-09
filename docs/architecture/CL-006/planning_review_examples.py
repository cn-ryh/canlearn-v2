"""Hand-authored counterexamples for the #30 review. Only sequential, in-memory design checks."""

from copy import deepcopy

from planning_reference import (
    Conflict,
    admit,
    budget_limits,
    complete,
    confirm,
    unique_tasks,
    usage,
)


def task(
    key="O-1",
    start="2026-10-16T09:00:00+08:00",
    end="2026-10-16T09:15:00+08:00",
    minutes=15,
):
    return {
        "account": "U-A",
        "occurrence_key": key,
        "occurrence_revision": 1,
        "resource_version_ref": "READ-v1",
        "purpose": "practice",
        "minutes": minutes,
        "window_start": start,
        "window_end": end,
    }


def review_examples(record) -> None:
    def rejects(name, operation, code):
        try:
            operation()
        except Conflict as error:
            record(name, str(error) == code, str(error))
        else:
            raise AssertionError(f"{name}: expected {code}")

    original = task()
    changed = task(end="2026-10-16T09:20:00+08:00", minutes=20)
    for values, name in [
        ([original, changed], "forward"),
        ([changed, original], "reverse"),
    ]:
        rejects(
            f"same-identity-different-payload-{name}",
            lambda values=values: unique_tasks(values),
            "OCCURRENCE_PAYLOAD_CONFLICT",
        )
    clone = {**original, "plan_version_id": "PLAN-2"}
    record(
        "plan-copy-keeps-occurrence-identity",
        len(unique_tasks([original, clone])) == 1,
        "O-1",
    )
    moved = task(start="2026-10-17T10:00:00+08:00", end="2026-10-17T10:15:00+08:00")
    current = usage([moved], "Asia/Shanghai", "U-A")
    record(
        "reorder-selects-current-arrangement-only",
        current == {"day:2026-10-17": 900, "week:2026-10-12": 900},
        current,
    )
    rejects(
        "completed-task-cannot-be-rescheduled",
        lambda: admit([original], [moved], {}, "Asia/Shanghai"),
        "PROTECTED_OCCURRENCE",
    )
    repeat = task("O-2", "2026-10-16T09:15:00+08:00", "2026-10-16T09:30:00+08:00")
    repeat_usage = usage([original, repeat], "Asia/Shanghai", "U-A")
    record(
        "intentional-repeat-has-new-identity",
        repeat_usage["day:2026-10-16"] == 1800,
        repeat_usage,
    )
    rejects(
        "account-reference-cannot-mix",
        lambda: usage([{**original, "account": "U-B"}], "Asia/Shanghai", "U-A"),
        "ACCOUNT_MISMATCH",
    )
    cross = task(
        start="2026-10-18T23:50:00+08:00", end="2026-10-19T00:10:00+08:00", minutes=20
    )
    split = usage([cross], "Asia/Shanghai", "U-A")
    record(
        "midnight-and-monday-split-without-double-charge",
        split
        == {
            "day:2026-10-18": 600,
            "week:2026-10-12": 600,
            "day:2026-10-19": 600,
            "week:2026-10-19": 600,
        },
        split,
    )
    midnight = usage(
        [task(start="2026-10-18T23:45:00+08:00", end="2026-10-19T00:00:00+08:00")],
        "Asia/Shanghai",
        "U-A",
    )
    record(
        "half-open-midnight-has-no-next-day-charge",
        midnight == {"day:2026-10-18": 900, "week:2026-10-12": 900},
        midnight,
    )
    for label, start, end in [
        ("fall", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"),
        ("spring", "2026-03-08T01:30:00-05:00", "2026-03-08T03:30:00-04:00"),
    ]:
        measured = usage(
            [task(start=start, end=end, minutes=60)], "America/New_York", "U-A"
        )
        record(
            f"dst-{label}-uses-elapsed-utc-seconds",
            sum(v for k, v in measured.items() if k.startswith("day:")) == 3600,
            measured,
        )
    rejects(
        "overlapping-tasks-rejected",
        lambda: usage(
            [original, {**original, "occurrence_key": "OTHER"}], "Asia/Shanghai", "U-A"
        ),
        "OVERLAPPING_TASKS",
    )
    rejects(
        "duplicate-budget-does-not-add-capacity",
        lambda: budget_limits(
            [
                {"period": "day:2026-10-16", "minutes": 30},
                {"period": "day:2026-10-16", "minutes": 40},
            ]
        ),
        "BUDGET_PERIOD_CONFLICT",
    )
    rejects(
        "weekly-limit-blocks-when-day-fits",
        lambda: admit(
            [],
            [original],
            {"day:2026-10-16": 1800, "week:2026-10-12": 600},
            "Asia/Shanghai",
        ),
        "CAPACITY_CONFLICT",
    )
    rejects(
        "week-budget-must-start-on-monday",
        lambda: budget_limits([{"period": "week:2026-10-13", "minutes": 30}]),
        "BUDGET_PERIOD_INVALID",
    )
    rejects(
        "noncanonical-period-cannot-create-second-budget",
        lambda: budget_limits([{"period": "day:20261016", "minutes": 30}]),
        "BUDGET_PERIOD_INVALID",
    )
    rejects(
        "daily-limit-blocks-when-week-fits",
        lambda: admit(
            [],
            [original],
            {"day:2026-10-16": 600, "week:2026-10-12": 1800},
            "Asia/Shanghai",
        ),
        "CAPACITY_CONFLICT",
    )
    accepted = admit(
        [], [original], {"day:2026-10-16": 900, "week:2026-10-12": 900}, "Asia/Shanghai"
    )
    record(
        "daily-weekly-equality-is-admissible",
        accepted["future_seconds"]["day:2026-10-16"] == 900,
        accepted,
    )
    snapshot = deepcopy(original)
    shrunk = admit([original], [], {"week:2026-10-12": 600}, "Asia/Shanghai")
    record(
        "shrink-keeps-completed-charge-and-overage",
        original == snapshot
        and shrunk["protected_seconds"]["week:2026-10-12"] == 900
        and shrunk["overcommitted"] == ["week:2026-10-12"],
        shrunk,
    )
    rejects(
        "shrink-does-not-admit-more-work",
        lambda: admit([original], [repeat], {"week:2026-10-12": 600}, "Asia/Shanghai"),
        "CAPACITY_CONFLICT",
    )
    next_day = task("NEXT", "2026-10-17T09:00:00+08:00", "2026-10-17T09:15:00+08:00")
    rejects(
        "next-plan-cannot-erase-this-weeks-completion",
        lambda: admit(
            [original], [next_day], {"week:2026-10-12": 1200}, "Asia/Shanghai"
        ),
        "CAPACITY_CONFLICT",
    )
    for first, second in [("A", "B"), ("B", "A")]:
        state = {"revision": 1, "requests": {}}
        confirm(state, 1, first, {"future": [original]})
        rejects(
            f"confirmation-interleaving-{first}-wins",
            lambda state=state, second=second: confirm(
                state, 1, second, {"future": [moved]}
            ),
            "VERSION_CONFLICT",
        )
        record(
            f"confirmation-interleaving-{first}-single-effect",
            state["revision"] == 2 and len(state["requests"]) == 1,
            state["revision"],
        )
    state = {"revision": 1, "requests": {}}
    first = confirm(state, 1, "KEY", {"future": [original]})
    replay = confirm(state, 1, "KEY", {"future": [original]})
    record(
        "confirmation-request-replay-no-second-effect",
        first == replay == state["revision"] == 2,
        replay,
    )
    rejects(
        "confirmation-request-key-conflict",
        lambda: confirm(state, 1, "KEY", {"future": [changed]}),
        "REQUEST_KEY_CONFLICT",
    )
    facts = {}
    complete(facts, original)
    complete(facts, original)
    record("completion-replay-no-second-fact", len(facts) == 1, len(facts))
    rejects(
        "completion-payload-conflict",
        lambda: complete(facts, changed),
        "COMPLETION_PAYLOAD_CONFLICT",
    )
