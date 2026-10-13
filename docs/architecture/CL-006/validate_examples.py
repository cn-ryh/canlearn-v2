"""Run pure-memory model examples; does not verify application authorization or SQL."""

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def closure(edges: list[dict], root: str) -> set[str]:
    reached, pending = {root}, [root]
    while pending:
        node = pending.pop()
        for edge in edges:
            if edge["upstream"] == node and edge["downstream"] not in reached:
                reached.add(edge["downstream"])
                pending.append(edge["downstream"])
    return reached


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    path = Path(__file__).with_name("examples.json")
    data = json.loads(path.read_text())
    rows = []

    def record(case: str, condition: bool, observed):
        if not condition:
            raise AssertionError(case)
        rows.append({"case": case, "passed": True, "observed": observed})

    tasks = data["tasks"]
    unique = {task["occurrence_key"]: task["minutes"] for task in tasks}
    minutes = sum(unique.values())
    record(
        "shared-task-counted-once",
        len(tasks[0]["goals"]) == 2 and unique["O-1"] == 15,
        15,
    )
    record(
        "capacity-conflict-visible",
        minutes == 35 and minutes > data["capacity"]["daily_minutes"],
        {"requested": minutes, "limit": 30},
    )
    replayed = tasks + [tasks[0]]
    replay_sum = sum(
        {task["occurrence_key"]: task["minutes"] for task in replayed}.values()
    )
    record("duplicate-task-replay-no-extra-charge", replay_sum == minutes, replay_sum)
    packages = data["packages"]
    keys = {tuple(sorted(package)) for package in packages}
    record(
        "new-subject-uses-same-fields",
        len(keys) == 1 and len({p["subject"] for p in packages}) == 4,
        sorted({p["subject"] for p in packages}),
    )
    same_label = [p for p in packages if p["label"] == "基础物理"]
    record(
        "same-label-private-public-remain-distinct",
        len({p["id"] for p in same_label}) == 2
        and len({p["space"] for p in same_label}) == 2,
        [p["id"] for p in same_label],
    )
    private = next(s for s in data["spaces"] if s["id"] == "S-A")
    record(
        "unrelated-account-does-not-own-space",
        private["owner"] != "U-B",
        {"claimant": "U-B", "owner": private["owner"]},
    )
    source, public = data["source_snapshots"][1], data["source_snapshots"][3]
    purposes = set(source["purposes"]) & set(public["purposes"])
    record(
        "mixed-private-public-purpose-intersection",
        "publish" not in purposes and source["space"] == "S-A",
        {"space": "S-A", "purposes": sorted(purposes)},
    )
    before = dict(data["attempt"])
    current = data["current_after_correction"]
    record(
        "late-result-after-correction-rejected",
        data["job_snapshot"] != current,
        {"input_revision": 1, "current_revision": 2},
    )
    record(
        "correction-does-not-rewrite-attempt",
        data["attempt"] == before and before["original_grade_version"] == "GRADE-v1",
        before,
    )
    reached = closure(data["dependencies"], "SRC-A-v1")
    expected = {
        "SRC-A-v1",
        "PARSE-A",
        "CHUNK-A",
        "INDEX-A",
        "QUESTION-v1",
        "EXPLANATION-v1",
        "EVIDENCE-v1",
        "FUTURE-TASK",
        "EXPORT-v1",
    }
    record(
        "deletion-propagates-to-dependent-assets",
        reached == expected and "SRC-B-v1" not in reached,
        sorted(reached),
    )
    deleted = data["current_after_deletion"]
    record(
        "late-result-after-deletion-rejected",
        data["job_snapshot"] != deleted
        and deleted["admission_epoch"] > data["job_snapshot"]["admission_epoch"],
        deleted,
    )
    record(
        "old-restore-point-not-opened",
        data["old_restore_watermark"] < data["latest_deletion_watermark"],
        {"restore": 0, "required": 1, "traffic_allowed": False},
    )
    # A cycle in a malformed dependency graph cannot make the closure walk infinite.
    cyclic = data["dependencies"] + [
        {"upstream": "EXPORT-v1", "downstream": "SRC-A-v1"}
    ]
    record(
        "dependency-cycle-walk-is-bounded",
        closure(cyclic, "SRC-A-v1") == reached,
        "visited-set traversal; malformed cycles require review",
    )
    report = {
        "date": datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat(),
        "scope": "Pure-memory design examples; not a SQL, business authorization, deletion or recovery acceptance",
        "synthetic": True,
        "fixture_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "checks": rows,
        "passed": len(rows),
        "human_non_author_review": "pending",
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(rows)} design examples passed; human review and runtime verification pending."
    )


if __name__ == "__main__":
    main()
