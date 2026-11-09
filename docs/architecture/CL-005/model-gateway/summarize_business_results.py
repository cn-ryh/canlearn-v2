"""Independently recompute observed usage and quote scenarios; never call a provider."""

import argparse
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--first", type=Path, required=True)
    parser.add_argument("--recheck", type=Path, required=True)
    parser.add_argument("--gate", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    here = Path(__file__).parent
    rates_path = here / "quoted-rates.json"
    rates = json.loads(rates_path.read_text())
    paths = [args.first, args.recheck] + ([args.gate] if args.gate else [])
    reports = [json.loads(path.read_text()) for path in paths]
    sources = []
    groups = []
    for path, report in zip(paths, reports, strict=True):
        assert report["complete"] and len(report["runs"]) <= report["max_requests"]
        assert (
            report["quoted_rates_sha256"]
            == hashlib.sha256(rates_path.read_bytes()).hexdigest()
        )
        runs = report["runs"]
        sources.append(
            {
                "file": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "requests": len(runs),
                "chains_accepted": sum(c["accepted"] for c in report["chains"]),
                "chains_attempted": len(report["chains"]),
                "categories": dict(Counter(r["category"] for r in runs)),
                "max_reported_output_tokens": max(
                    r["usage"]["output_tokens"] for r in runs if r["usage"]
                ),
                "chains": [
                    {
                        "generator": c["generator"],
                        "case": c["case"],
                        "raw_valid": c["raw_generation"]["valid"],
                        "fault_injected": c["fault_injected"],
                        "repair_attempts": c["repair_attempts"],
                        "initial_checker_agrees": c["initial_checker_agrees"],
                        "accepted": c["accepted"],
                        "elapsed_seconds": round(
                            sum(
                                r["elapsed_seconds"]
                                for r in runs
                                if r["case"] == c["case"]
                                and (
                                    (
                                        r["model"] == c["generator"]
                                        and r["stage"] in {"generate", "repair"}
                                    )
                                    or (
                                        r["model"] == c["checker"]
                                        and r["stage"] in {"verify", "verify_repair"}
                                    )
                                )
                            ),
                            3,
                        ),
                    }
                    for c in report["chains"]
                ],
            }
        )
    all_runs = [r for report in reports for r in report["runs"]]
    for model in sorted({r["model"] for r in all_runs}):
        rows = [r for r in all_runs if r["model"] == model]
        known = scenario = Decimal(0)
        cache_unknown = cached_total = tokens = usage_count = 0
        quote = rates[model]
        for row in rows:
            assert row["max_output_tokens"] == 16384 and row["automatic_retries"] == 0
            usage = row["usage"]
            if not usage:
                continue
            assert (
                usage["input_tokens"] + usage["output_tokens"] == usage["total_tokens"]
            )
            usage_count += 1
            tokens += usage["total_tokens"]
            cached = usage["cached_tokens"]
            cached_total += cached
            amount = (
                (usage["input_tokens"] - cached) * Decimal(quote["input_per_million"])
                + usage["output_tokens"] * Decimal(quote["output_per_million"])
            ) / Decimal(1000000)
            if cached and quote["cached_input_per_million"] is None:
                cache_unknown += cached
                assert Decimal(row["known_components_cost"]) == amount
                upper = amount + cached * Decimal(quote["input_per_million"]) / Decimal(
                    1000000
                )
                assert Decimal(row["estimated_cost_if_cached_billed_as_input"]) == upper
            else:
                amount += (
                    cached
                    * Decimal(quote["cached_input_per_million"] or "0")
                    / Decimal(1000000)
                )
                upper = amount
                assert Decimal(row["estimated_cost"]) == amount
            known += amount
            scenario += upper
        groups.append(
            {
                "model": model,
                "requests": len(rows),
                "requests_with_valid_usage": usage_count,
                "requests_without_usable_usage": len(rows) - usage_count,
                "reported_tokens": tokens,
                "cached_input_tokens": cached_total,
                "cached_tokens_without_quote": cache_unknown,
                "known_priced_components_CNY": str(known),
                "scenario_unknown_cache_as_normal_input_CNY": str(scenario),
            }
        )
    result = {
        "date": reports[-1]["date"],
        "scope": "Business-chain first run, explicit-schema control and optional local-rule audit; prior 95 calls excluded",
        "sources": sources,
        "request_count": len(all_runs),
        "requests_without_usable_usage": sum(r["usage"] is None for r in all_runs),
        "reported_total_tokens": sum(
            r["usage"]["total_tokens"] for r in all_runs if r["usage"]
        ),
        "groups": groups,
        "known_priced_components_CNY": str(
            sum(Decimal(g["known_priced_components_CNY"]) for g in groups)
        ),
        "scenario_unknown_cache_as_normal_input_CNY": str(
            sum(
                Decimal(g["scenario_unknown_cache_as_normal_input_CNY"]) for g in groups
            )
        ),
        "actual_total_charge": None,
        "billing_verified": False,
        "quoted_rates_sha256": hashlib.sha256(rates_path.read_bytes()).hexdigest(),
        "summary_script_sha256": hashlib.sha256(
            Path(__file__).read_bytes()
        ).hexdigest(),
        "combined_reservation_scenario_CNY": reports[-1][
            "reserved_quote_upper_scenario"
        ],
        "reservation_budget_scenario_CNY": reports[-1]["quote_budget_scenario"],
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(all_runs)} requests reconciled to observed usage; actual bill remains unknown."
    )


if __name__ == "__main__":
    main()
