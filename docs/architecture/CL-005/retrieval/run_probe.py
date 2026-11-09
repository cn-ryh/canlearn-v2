# /// script
# requires-python = ">=3.12"
# dependencies = ["psycopg[binary]==3.2.10", "jieba==0.42.1"]
# ///
"""Exercise retrieval controls on a disposable local database with synthetic vectors."""

import argparse
import json
import logging
import os
from urllib.parse import urlsplit

import jieba
import psycopg

SCHEMA = "cl005_retrieval_probe"
ROLE = "cl005_probe_reader"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", help="Optional JSON result path; contains no credentials or URLs"
    )
    args = parser.parse_args()
    dsn = os.environ.get("CL005_PROBE_DATABASE_URL", "")
    target = urlsplit(dsn)
    if target.hostname != "127.0.0.1" or target.path != "/canlearn_cl005_retrieval":
        raise SystemExit(
            "Use the disposable local database canlearn_cl005_retrieval on 127.0.0.1"
        )
    jieba.setLogLevel(logging.WARNING)
    checks = []
    with psycopg.connect(dsn, autocommit=True) as conn:
        extension_created = False
        role_created = False
        schema_created = False
        try:
            # Refuse to reset a previous probe or touch application tables.
            assert (
                conn.execute(
                    "SELECT 1 FROM pg_namespace WHERE nspname=%s", (SCHEMA,)
                ).fetchone()
                is None
            ), "Probe schema already exists; inspect it before rerunning"
            assert (
                conn.execute(
                    "SELECT 1 FROM pg_roles WHERE rolname=%s", (ROLE,)
                ).fetchone()
                is None
            ), "Probe role already exists; inspect it before rerunning"
            if (
                conn.execute(
                    "SELECT 1 FROM pg_extension WHERE extname='vector'"
                ).fetchone()
                is None
            ):
                conn.execute("CREATE EXTENSION vector")
                extension_created = True
            version = conn.execute(
                "SELECT extversion FROM pg_extension WHERE extname='vector'"
            ).fetchone()[0]
            conn.execute(f"CREATE SCHEMA {SCHEMA}")
            schema_created = True
            conn.execute(f"CREATE ROLE {ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS")
            role_created = True
            conn.execute(f"SET search_path = {SCHEMA}, public")
            conn.execute("""
                CREATE TABLE assets (
                    id text PRIMARY KEY, owner_id text NOT NULL, current_version int NOT NULL,
                    deleted bool NOT NULL DEFAULT false, visibility text NOT NULL DEFAULT 'private',
                    approved bool NOT NULL DEFAULT false
                );
                CREATE TABLE generations (
                    id int PRIMARY KEY, ready bool NOT NULL
                );
                CREATE TABLE publication (
                    id int PRIMARY KEY CHECK (id = 1), generation int NOT NULL REFERENCES generations
                );
                CREATE TABLE chunks (
                    id text NOT NULL, asset_id text NOT NULL REFERENCES assets, version int NOT NULL,
                    generation int NOT NULL REFERENCES generations, confirmed bool NOT NULL,
                    content_kind text NOT NULL, lexical tsvector NOT NULL, embedding vector(3) NOT NULL,
                    PRIMARY KEY(id, generation)
                );
                INSERT INTO assets VALUES
                    ('alice', 'A', 2, false, 'private', false),
                    ('bob', 'B', 1, false, 'private', false),
                    ('public', 'C', 1, false, 'public', true),
                    ('candidate', 'C', 1, false, 'public', false);
                INSERT INTO generations VALUES (1, true), (2, false);
                INSERT INTO publication VALUES (1, 1);
            """)
            text = "栈采用后进先出，队列采用先进先出。"
            tokens = " ".join(jieba.cut_for_search(text))
            rows = [
                ("alice-new", "alice", 2, 1, True, "evidence", "[1,0,0]"),
                ("alice-old", "alice", 1, 1, True, "evidence", "[1,0,0]"),
                ("alice-unconfirmed", "alice", 2, 1, False, "evidence", "[1,0,0]"),
                ("alice-answer", "alice", 2, 1, True, "answer", "[1,0,0]"),
                ("alice-rebuild", "alice", 2, 2, True, "evidence", "[1,0,0]"),
                ("bob-identical", "bob", 1, 1, True, "evidence", "[1,0,0]"),
                ("public-approved", "public", 1, 1, True, "evidence", "[0,1,0]"),
                ("public-candidate", "candidate", 1, 1, True, "evidence", "[1,0,0]"),
            ]
            for row in rows:
                conn.execute(
                    "INSERT INTO chunks VALUES (%s,%s,%s,%s,%s,%s,to_tsvector('simple',%s),%s)",
                    (*row[:-1], tokens, row[-1]),
                )
            conn.execute(f"""
                ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
                ALTER TABLE assets FORCE ROW LEVEL SECURITY;
                CREATE POLICY asset_scope ON assets FOR SELECT TO {ROLE} USING (
                    owner_id = current_setting('canlearn.probe_owner', true)
                    OR (visibility = 'public' AND approved)
                );
                ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
                ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
                CREATE POLICY chunk_scope ON chunks FOR SELECT TO {ROLE} USING (
                    EXISTS (SELECT 1 FROM assets a WHERE a.id=asset_id)
                );
                GRANT USAGE ON SCHEMA {SCHEMA} TO {ROLE};
                GRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA} TO {ROLE};
            """)

            def retrieve(owner: str, lexical: bool = False) -> list[str]:
                # SET LOCAL is transaction-scoped so pooled connections do not leak owner context.
                with conn.transaction():
                    conn.execute(f"SET LOCAL ROLE {ROLE}")
                    conn.execute(
                        "SELECT set_config('canlearn.probe_owner',%s,true)", (owner,)
                    )
                    query = " ".join(jieba.cut_for_search("后进先出"))
                    condition = (
                        "AND c.lexical @@ plainto_tsquery('simple',%s)"
                        if lexical
                        else ""
                    )
                    params = (query,) if lexical else ()
                    return [
                        r[0]
                        for r in conn.execute(
                            f"""
                        WITH eligible AS MATERIALIZED (
                            SELECT c.id,c.embedding FROM chunks c JOIN assets a ON a.id=c.asset_id
                            JOIN publication p ON p.generation=c.generation
                            JOIN generations g ON g.id=p.generation
                            WHERE NOT a.deleted AND a.current_version=c.version AND c.confirmed
                                AND c.content_kind='evidence' AND g.ready {condition}
                        )
                        SELECT id FROM eligible ORDER BY embedding <=> '[1,0,0]'::vector,id LIMIT 10
                    """,
                            params,
                        )
                    ]

            def record(name: str, actual: object, expected: object) -> None:
                assert actual == expected, f"{name}: {actual!r} != {expected!r}"
                checks.append({"name": name, "passed": True, "actual": actual})

            record(
                "scope-version-quality-purpose-generation-filter",
                retrieve("A"),
                ["alice-new", "public-approved"],
            )
            record(
                "identical-other-user-input-keeps-independent-scope",
                retrieve("B"),
                ["bob-identical", "public-approved"],
            )
            record(
                "unset-or-anonymous-owner-no-private-match",
                retrieve(""),
                ["public-approved"],
            )
            record(
                "segmented-chinese-lexical-query",
                retrieve("A", lexical=True),
                ["alice-new", "public-approved"],
            )
            raw_match = conn.execute(
                "SELECT to_tsvector('simple',%s) @@ plainto_tsquery('simple',%s)",
                (text, "后进先出"),
            ).fetchone()[0]
            record("raw-simple-config-misses-subphrase", raw_match, False)
            try:
                with conn.transaction():
                    conn.execute("UPDATE publication SET generation=2")
                    raise RuntimeError("synthetic interrupted publication")
            except RuntimeError:
                pass
            record(
                "interrupted-rebuild-retains-old-published-generation",
                retrieve("A"),
                ["alice-new", "public-approved"],
            )
            conn.execute("UPDATE assets SET deleted=true WHERE id='alice'")
            record(
                "tombstone-blocks-before-physical-vector-cleanup",
                retrieve("A"),
                ["public-approved"],
            )
            conn.execute("UPDATE generations SET ready=true WHERE id=2")
            conn.execute("UPDATE publication SET generation=2")
            record("rebuilt-index-cannot-resurrect-deleted-resource", retrieve("A"), [])
            with conn.transaction():
                conn.execute(f"SET LOCAL ROLE {ROLE}")
                conn.execute("SELECT set_config('canlearn.probe_owner','A',true)")
                private_rows = conn.execute(
                    "SELECT id FROM assets WHERE owner_id='B'"
                ).fetchall()
                record(
                    "non-owner-non-bypassrls-role-blocks-direct-other-user-read",
                    private_rows,
                    [],
                )
            record(
                "transaction-owner-context-not-reused",
                conn.execute(
                    "SELECT coalesce(current_setting('canlearn.probe_owner',true),'')"
                ).fetchone()[0],
                "",
            )
            result = {
                "scope": "isolated PostgreSQL controls; handcrafted 3D vectors, not semantic evaluation",
                "postgres": conn.execute("SHOW server_version").fetchone()[0],
                "pgvector": version,
                "jieba": jieba.__version__,
                "checks": checks,
                "no_real_embedding_or_mineru": True,
            }
            output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
            if args.output:
                from pathlib import Path

                Path(args.output).write_text(output, encoding="utf-8")
            print(output, end="")
        finally:
            conn.execute("RESET ROLE")
            if schema_created:
                conn.execute(f"DROP SCHEMA {SCHEMA} CASCADE")
            if role_created:
                conn.execute(f"DROP ROLE {ROLE}")
            if extension_created:
                conn.execute("DROP EXTENSION vector")


if __name__ == "__main__":
    main()
