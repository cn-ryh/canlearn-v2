"""Offline version/append-only migration guard. SQL checks are conservative, not a SQL proof."""

import hashlib
import json
import re
import subprocess
from pathlib import Path

import tomllib

ROOT = Path(__file__).resolve().parents[1]


def assert_safe_sql(sql: str) -> None:
    # Remove comments, then conservatively reject destructive/tightening statements.
    code = re.sub(r"/\*.*?\*/|--[^\n]*", " ", sql, flags=re.DOTALL)
    if re.search(
        r"\b(DROP|TRUNCATE|RENAME)\b|(?:^|;)\s*(DELETE|UPDATE)\b|\bSET\s+NOT\s+NULL\b|\bALTER\s+COLUMN\b|\bADD\s+(?:COLUMN\s+)?[^;]*\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)|\bALTER\s+TYPE\b",
        code,
        re.IGNORECASE,
    ):
        raise ValueError(
            "Migration needs explicit compatibility/backfill review; destructive/tightening SQL rejected"
        )


def check_migrations(root: Path = ROOT, base: str | None = None) -> None:
    folder = root / "apps/api/drizzle"
    journal = json.loads((folder / "meta/_journal.json").read_text())
    entries = journal["entries"]
    if [entry["idx"] for entry in entries] != list(range(len(entries))):
        raise ValueError("Migration indices are not contiguous")
    times = [entry["when"] for entry in entries]
    if times != sorted(set(times)):
        raise ValueError("Migration times must be strictly increasing")
    expected = {f"{entry['tag']}.sql" for entry in entries}
    if expected != {path.name for path in folder.glob("*.sql")}:
        raise ValueError("SQL files and migration journal disagree")
    frozen = json.loads((root / "security/migration-baseline.json").read_text())
    for name, digest in frozen.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"Applied migration evidence changed: {name}")
    for entry in entries:
        assert_safe_sql((folder / f"{entry['tag']}.sql").read_text())
        snapshot = json.loads(
            (folder / f"meta/{entry['idx']:04d}_snapshot.json").read_text()
        )
        if snapshot["dialect"] != "postgresql":
            raise ValueError("Migration snapshot dialect mismatch")
    if base:
        prior_files = subprocess.check_output(
            ["git", "ls-tree", "-r", "--name-only", base, "apps/api/drizzle"],
            cwd=root,
            text=True,
        ).splitlines()
        for name in prior_files:
            if name.endswith((".sql", "_snapshot.json")):
                before = subprocess.check_output(
                    ["git", "show", f"{base}:{name}"], cwd=root
                )
                if not (root / name).exists() or (root / name).read_bytes() != before:
                    raise ValueError(f"Base branch applied migration changed: {name}")


def check_versions(root: Path = ROOT) -> None:
    for path in [
        root / "package.json",
        *sorted((root / "apps").glob("*/package.json")),
    ]:
        package = json.loads(path.read_text())
        for group in ("dependencies", "devDependencies", "optionalDependencies"):
            for name, version in package.get(group, {}).items():
                if not re.fullmatch(
                    r"\d+\.\d+\.\d+(?:-[\w.-]+)?", version
                ) and not version.startswith("workspace:"):
                    raise ValueError(
                        f"Unpinned dependency: {path.relative_to(root)} {name}"
                    )
    project = tomllib.loads((root / "apps/workflow/pyproject.toml").read_text())
    requirements = [
        *project["project"]["dependencies"],
        *project["dependency-groups"]["dev"],
        *project["build-system"]["requires"],
    ]
    if any(not re.fullmatch(r"[\w.-]+==\d+\.\d+\.\d+", item) for item in requirements):
        raise ValueError("Python dependencies/build backend require exact versions")
    for path in (root / ".github/workflows").glob("*.yml"):
        for action in re.findall(r"uses:\s*(\S+)", path.read_text()):
            if not re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", action):
                raise ValueError(f"Action is not pinned by full commit SHA: {action}")
    images = re.findall(
        r"^\s+image:\s*(.+)$", (root / "compose.yaml").read_text(), re.MULTILINE
    )
    if len(images) != 4 or any(
        not re.search(r":[\w.-]+@sha256:[0-9a-f]{64}$", image) for image in images
    ):
        raise ValueError("All four Compose images require a named tag and digest")
    for tool in json.loads((root / "security/tools.json").read_text()).values():
        if not re.fullmatch(r"[0-9a-f]{64}", tool["sha256"]) or not tool[
            "url"
        ].startswith("https://github.com/"):
            raise ValueError("Scanner download is not checksum-pinned HTTPS")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base", help="CI pull_request base SHA; its applied migrations are immutable"
    )
    args = parser.parse_args()
    check_migrations(base=args.base)
    check_versions()
    print("Version and append-only migration policy passed")
