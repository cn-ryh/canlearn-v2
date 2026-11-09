"""Validate existing synthetic fixture integrity/splits; no parser or human review."""

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    here = Path(__file__).parent
    root = here.parents[2]
    manifest = json.loads((here / "corpus-manifest.json").read_text())
    families, checks, pages = {}, [], 0
    assert manifest["synthetic"] and manifest["external_admitted_documents"] == 0
    for sample in manifest["samples"]:
        pdf = root / sample["file"]
        assert (
            pdf.is_file()
            and hashlib.sha256(pdf.read_bytes()).hexdigest() == sample["sha256"]
        ), sample["id"]
        assert sample["pages"] > 0 and sample["requested_pages"] == list(
            range(1, sample["pages"] + 1)
        )
        assert (
            sample["source_type"] == "synthetic_internal"
            and sample["human_annotation"] == "pending"
        )
        assert (
            sample["family_id"] not in families
            or families[sample["family_id"]] == sample["split"]
        ), "family split leakage"
        families[sample["family_id"]] = sample["split"]
        pages += sample["pages"]
        source = json.loads((root / sample["source_manifest"]).read_text())
        if "samples" in source:
            original = next(
                row for row in source["samples"] if row["id"] == sample["id"]
            )
            assert (
                original["sha256"] == sample["sha256"]
                and original["pages"] == sample["pages"]
            )
            assert len(original["anchors"]) == sample["generator_reference_anchors"]
            assert all(
                1 <= anchor["pdf_page"] <= sample["pages"]
                for anchor in original["anchors"]
            )
        else:
            assert (
                source["sha256"] == sample["sha256"]
                and source["pages"] == sample["pages"]
            )
        checks.append(
            {
                "sample_id": sample["id"],
                "integrity_passed": True,
                "requested_page_inventory_passed": True,
                "parser_executed": False,
                "human_annotation": "pending",
            }
        )
    assert pages == 310 and len(families) == 5 and len(checks) == 6
    report = {
        "date": datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat(),
        "scope": "Existing synthetic fixture SHA, declared requested-page inventory, generator anchors and family split consistency; no parser/quality/human annotation proof",
        "manifest_sha256": hashlib.sha256(
            (here / "corpus-manifest.json").read_bytes()
        ).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "synthetic_families": len(families),
        "synthetic_files": len(checks),
        "synthetic_version_pages": pages,
        "external_admitted_documents": 0,
        "external_admitted_pages": 0,
        "r0_real_sample_target": {"documents": 12, "pages": 120},
        "human_dual_review": "pending",
        "checks": checks,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(checks)} synthetic files verified; external benchmark remains 0/12 documents, 0/120 pages."
    )


if __name__ == "__main__":
    main()
