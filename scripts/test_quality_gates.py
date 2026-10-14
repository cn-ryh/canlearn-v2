"""Fault probes for CI guard behavior, using disposable copies and no private samples."""

import json
import shutil
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from quality_policy import ROOT, assert_safe_sql, check_migrations, check_versions
from security_scan import blockers, images_enforced


@pytest.mark.parametrize(
    "sql",
    [
        "DROP TABLE jobs;",
        "ALTER TABLE jobs DROP COLUMN input;",
        "ALTER TABLE jobs ADD COLUMN owner_id uuid NOT NULL;",
        "ALTER TABLE jobs ALTER COLUMN input TYPE text;",
        "TRUNCATE jobs;",
        "DELETE FROM jobs;",
        "ALTER TYPE job_status ADD VALUE 'UNKNOWN';",
    ],
)
def test_destructive_or_incompatible_sql_blocks(sql: str) -> None:
    with pytest.raises(ValueError):
        assert_safe_sql(sql)


def test_applied_migration_change_blocks(tmp_path: Path) -> None:
    shutil.copytree(ROOT / "apps/api/drizzle", tmp_path / "apps/api/drizzle")
    shutil.copytree(ROOT / "security", tmp_path / "security")
    frozen = json.loads((tmp_path / "security/migration-baseline.json").read_text())
    migration = tmp_path / next(name for name in frozen if name.endswith(".sql"))
    migration.write_text(migration.read_text() + "\n-- controlled drift\n")
    with pytest.raises(ValueError, match="Applied migration"):
        check_migrations(tmp_path)


def test_unpinned_action_blocks(tmp_path: Path) -> None:
    for name in (
        "package.json",
        "compose.yaml",
        "apps/workflow/pyproject.toml",
        "security/tools.json",
        ".github/workflows/ci.yml",
    ):
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    workflow = tmp_path / ".github/workflows/ci.yml"
    workflow.write_text(
        workflow.read_text() + "\n      - uses: actions/checkout@main\n"
    )
    with pytest.raises(ValueError, match="not pinned"):
        check_versions(tmp_path)


def test_high_unfixed_dependency_still_blocks() -> None:
    assert blockers(
        [
            {
                "target": "uv.lock",
                "id": "synthetic",
                "package": "fixture",
                "version": "0.0.0",
                "severity": "HIGH",
                "fixed_version": "",
            }
        ],
        [],
    )


def test_expired_or_broad_exception_blocks() -> None:
    with pytest.raises(ValueError):
        blockers(
            [],
            [
                {
                    "reason": "controlled",
                    "expires": str(datetime.now(UTC).date() - timedelta(days=1)),
                }
            ],
        )


def test_current_repository_policy() -> None:
    check_migrations()
    check_versions()


def test_image_triage_deadline_enforces_blocking() -> None:
    policy = {
        "mode": "report-only",
        "owner_roles": ["A", "B"],
        "triage_due": "2026-10-21",
    }
    assert not images_enforced(policy, date(2026, 10, 21))
    assert images_enforced(policy, date(2026, 10, 22))
    assert images_enforced({**policy, "mode": "enforce"}, date(2026, 10, 14))


def test_invalid_image_policy_blocks() -> None:
    with pytest.raises(ValueError):
        images_enforced({"mode": "disabled"})
