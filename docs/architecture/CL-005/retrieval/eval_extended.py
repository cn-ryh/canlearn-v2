"""Pinned GPU probes for long chunks, distractors, abstention and query contention.

Use the existing isolated embedding environment; --validate-fixtures needs only stdlib.
Each invocation loads one model. Never combine allocator measurements across models.
"""

import argparse
import hashlib
import json
import math
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = [
    ("stack", "栈遵循后进先出，push 将元素放入栈顶，pop 移出最近放入的元素。"),
    ("queue", "队列遵循先进先出，enqueue 从队尾加入，dequeue 从队首移出。"),
    (
        "motion",
        "匀加速直线运动的速度等于初速度加加速度乘时间，位移包含二分之一加速度乘时间平方。",
    ),
    ("retrieval", "检索结果必须保留来源版本、页码和权限域；向量是可重建的派生索引。"),
    (
        "deletion",
        "资料删除先撤销访问和新任务，再清理原件、分块、向量、缓存及外部副本。",
    ),
    (
        "evidence",
        "有效学习证据记录真实完成、回忆或退出测、关联技能和来源版本，答错也可有学习价值。",
    ),
    (
        "privacy",
        "私有资料默认不公开、不训练、不跨空间检索，客户端提交的空间 ID 不产生权限。",
    ),
    ("versioning", "来源版本纠错不能静默覆盖历史作答，旧版本结果不能参与新生成。"),
]
DISTRACTORS = [
    (
        "stack_site",
        "Stack Overflow 是技术问答站点。本段讨论网站名称，不介绍数据结构的出栈顺序。",
    ),
    (
        "queue_ticket",
        "排号屏显示等待人数与窗口编号。本段没有说明队列算法的入队与出队操作。",
    ),
    (
        "motion_uniform",
        "匀速直线运动每秒位移相同。本段讨论恒定速度，没有给出加速情况下的位移公式。",
    ),
    (
        "retrieval_time",
        "检索性能记录查询开始和结束时间。本段没有说明结果的来源页码或权限过滤。",
    ),
    (
        "deletion_ui",
        "删除按钮旁显示确认提示。本段只描述按钮位置，没有定义派生副本的处理流程。",
    ),
    (
        "evidence_attendance",
        "签到表记录到场时间。本段不包含学习者的作答、回忆或技能证据。",
    ),
    (
        "privacy_demo",
        "公开演示使用原创合成资料。公开演示的用途不能推导私有文件的授权。",
    ),
    (
        "version_software",
        "软件版本标签记录构建编号。本段不说明学习来源纠错后历史作答的处理。",
    ),
]
ANSWERABLE = [
    ("栈的后进先出操作", "stack"),
    ("队列从哪里加入和移出元素", "queue"),
    ("加速度与位移公式", "motion"),
    ("向量索引和来源页码权限", "retrieval"),
    ("删除资料后的派生副本", "deletion"),
    ("答错是否能留下学习证据", "evidence"),
    ("私有文件能否用于训练和其他用户搜索", "privacy"),
    ("更正来源后历史作答和旧结果", "versioning"),
    ("Which structure removes the most recently inserted item first?", "stack"),
    ("How does a FIFO queue add and remove items?", "queue"),
    ("Displacement under constant acceleration", "motion"),
    ("Source page references and access control in vector search", "retrieval"),
    ("Remove source documents and their derived copies", "deletion"),
    ("Can an incorrect answer still provide evidence of learning?", "evidence"),
    ("May private files be used for training or other users' search?", "privacy"),
    ("Corrected source versions must not overwrite past answers", "versioning"),
]
UNANSWERABLE = [
    ("栈允许存储的最大元素数量具体是多少？", "near_domain"),
    ("队列最大等待时间规定为多少秒？", "near_domain"),
    ("匀加速运动实验中摩擦系数的数值是多少？", "near_domain"),
    ("向量检索所用模型的每百万 token 价格是多少？", "near_domain"),
    ("删除派生副本必须在几天内完成？", "near_domain"),
    ("学习证据积分的精确计算公式是什么？", "near_domain"),
    ("私有资料采用什么加密算法和密钥长度？", "near_domain"),
    ("旧来源版本回滚备份保留多少天？", "near_domain"),
    ("What is the maximum stack capacity in bytes?", "near_domain"),
    ("Which encryption algorithm protects private files?", "near_domain"),
    ("明天这座城市的降雨概率是多少？", "out_of_domain"),
    ("What is the chemical formula of caffeine?", "out_of_domain"),
]
SPECS = {
    "bge-m3": ("BAAI/bge-m3", "5617a9f61b028005a4858fdac845db406aefb181", "", ""),
    "multilingual-e5-small": (
        "intfloat/multilingual-e5-small",
        "614241f622f53c4eeff9890bdc4f31cfecc418b3",
        "query: ",
        "passage: ",
    ),
}
FILLER = "本段是原创合成测试的背景说明。记录文本用于观察输入长度和计算资源，不增加任何新的答案事实。"


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fixtures() -> dict:
    return {
        "synthetic": True,
        "version": 1,
        "documents": BASE + DISTRACTORS,
        "answerable": ANSWERABLE,
        "unanswerable": UNANSWERABLE,
        "padding": FILLER,
    }


def summary(values: list[float]) -> dict:
    ordered = sorted(values)
    return {
        "n": len(values),
        "median": round(statistics.median(values), 3),
        "p95_nearest_rank": round(ordered[math.ceil(len(ordered) * 0.95) - 1], 3),
        "max": round(max(values), 3),
        "samples": [round(v, 3) for v in values],
    }


def gpu_snapshot() -> dict:
    result = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=memory.used,memory.free,utilization.gpu",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    used, free, utilization = map(int, result.stdout.splitlines()[0].split(","))
    return {"used_mib": used, "free_mib": free, "utilization_percent": utilization}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate-fixtures", action="store_true")
    parser.add_argument("--model", choices=SPECS, default="bge-m3")
    parser.add_argument("--cache", type=Path, default=Path("./model-cache"))
    parser.add_argument("--output", type=Path, default=Path("extended-results.json"))
    parser.add_argument(
        "--query-only",
        action="store_true",
        help="60 queries for a concurrent external parse window",
    )
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--repeats", type=int, default=8)
    args = parser.parse_args()
    if args.repeats < 2:
        parser.error("Use at least two benchmark repeats")
    corpus = fixtures()
    labels = {key for key, _ in corpus["documents"]}
    assert len(labels) == 16 and len(ANSWERABLE) == 16 and len(UNANSWERABLE) == 12
    assert all(expected in labels for _, expected in ANSWERABLE)
    fixture_hash = digest(
        json.dumps(corpus, ensure_ascii=False, sort_keys=True).encode()
    )
    if args.validate_fixtures:
        print(
            json.dumps(
                {
                    "documents": 16,
                    "answerable": 16,
                    "unanswerable": 12,
                    "fixture_sha256": fixture_hash,
                }
            )
        )
        return
    import torch
    from sentence_transformers import SentenceTransformer

    if args.device == "cuda" and not torch.cuda.is_available():
        raise SystemExit(
            "CUDA required for 4070 measurements; CPU runs must be explicitly selected"
        )
    repo, revision, query_prefix, passage_prefix = SPECS[args.model]
    before = gpu_snapshot() if args.device == "cuda" else None
    start = time.perf_counter()
    model = SentenceTransformer(
        repo,
        revision=revision,
        cache_folder=str(args.cache),
        device=args.device,
        local_files_only=True,
    )
    model.eval()
    load_s = time.perf_counter() - start
    tokenizer = model.tokenizer
    result = {
        "model": args.model,
        "revision": revision,
        "device": args.device,
        "dtype": str(next(model.parameters()).dtype),
        "torch": torch.__version__,
        "load_seconds": round(load_s, 3),
        "fixture_sha256": fixture_hash,
        "script_sha256": digest(Path(__file__).read_bytes()),
        "gpu_before_load": before,
        "scope": "synthetic dense retrieval; encode includes tokenization/pooling/normalization; no network or DB",
        "benchmarks": [],
        "quality": [],
    }

    def sync() -> None:
        if args.device == "cuda":
            torch.cuda.synchronize()

    def encode(texts: list[str], batch: int = 1):
        return model.encode(
            texts,
            batch_size=batch,
            normalize_embeddings=True,
            convert_to_tensor=True,
            show_progress_bar=False,
        )

    def queries(n: int) -> dict:
        encode([query_prefix + ANSWERABLE[0][0]])
        times = []
        snapshots = []
        window_start = time.perf_counter()
        for i in range(n):
            sync()
            t = time.perf_counter()
            encode([query_prefix + ANSWERABLE[i % len(ANSWERABLE)][0]])
            sync()
            times.append((time.perf_counter() - t) * 1000)
            if args.device == "cuda" and i % 10 == 0:
                snapshots.append(gpu_snapshot())
        return {
            "latency_ms": summary(times),
            "window_seconds": round(time.perf_counter() - window_start, 3),
            "gpu_samples": snapshots,
        }

    if args.query_only:
        result["queries"] = queries(60)
    else:
        limits = [512, 1024, 2048] if args.model == "bge-m3" else [512]

        def sized_text(fact: str, limit: int, placement: str = "begin") -> str:
            # Character trimming preserves valid text and protects the answer at either end.
            filler = FILLER * (limit // 8 + 10)
            while True:
                if placement == "begin":
                    text = passage_prefix + fact + filler
                elif placement == "end":
                    text = passage_prefix + filler + fact
                else:
                    half = len(filler) // 2
                    text = passage_prefix + filler[:half] + fact + filler[half:]
                count = len(tokenizer.encode(text, add_special_tokens=True))
                if count <= limit:
                    # Tokenizer may not permit an exact count via text trimming; record actual count.
                    return text
                filler = filler[: -(max(1, (count - limit) // 2))]

        def rank_quality(passages: list[str], name: str) -> dict:
            vectors = encode(passages, 4)
            query_text = [q for q, _ in ANSWERABLE] + [q for q, _ in UNANSWERABLE]
            qvectors = encode([query_prefix + q for q in query_text], 4)
            scores = (qvectors @ vectors.T).detach().cpu()
            names = [key for key, _ in BASE + DISTRACTORS]
            rows = []
            for i, (query, row) in enumerate(zip(query_text, scores, strict=True)):
                ordered = row.argsort(descending=True).tolist()
                expected = ANSWERABLE[i][1] if i < len(ANSWERABLE) else None
                rows.append(
                    {
                        "query": query,
                        "expected": expected,
                        "category": "answerable"
                        if expected
                        else UNANSWERABLE[i - len(ANSWERABLE)][1],
                        "rank": ordered.index(names.index(expected)) + 1
                        if expected
                        else None,
                        "top3": [
                            {"id": names[j], "cosine": round(float(row[j]), 6)}
                            for j in ordered[:3]
                        ],
                        "top1_minus_top2": round(
                            float(row[ordered[0]] - row[ordered[1]]), 6
                        ),
                    }
                )
            positive = rows[: len(ANSWERABLE)]
            negatives = rows[len(ANSWERABLE) :]
            pos_min = min(row["top3"][0]["cosine"] for row in positive)
            neg_max = max(row["top3"][0]["cosine"] for row in negatives)
            return {
                "name": name,
                "documents": len(passages),
                "queries": rows,
                "recall@1": sum(row["rank"] == 1 for row in positive) / len(positive),
                "recall@3": sum(row["rank"] <= 3 for row in positive) / len(positive),
                "answerable_top1_min": pos_min,
                "unanswerable_top1_max": neg_max,
                "score_ranges_overlap": neg_max >= pos_min,
                "threshold": None,
                "note": "Small synthetic calibration set; no production abstention threshold",
            }

        for limit in limits:
            model.max_seq_length = limit
            texts = [sized_text(text, limit) for _, text in BASE]
            counts = [
                len(tokenizer.encode(text, add_special_tokens=True)) for text in texts
            ]
            for batch in (1, 4):
                encode(texts[:batch], batch)
                sync()
                if args.device == "cuda":
                    torch.cuda.reset_peak_memory_stats()
                gpu = [gpu_snapshot()] if args.device == "cuda" else []
                times = []
                for _ in range(args.repeats):
                    sync()
                    t = time.perf_counter()
                    encode(texts, batch)
                    sync()
                    times.append(time.perf_counter() - t)
                    if args.device == "cuda":
                        gpu.append(gpu_snapshot())
                result["benchmarks"].append(
                    {
                        "max_tokens_including_special": limit,
                        "actual_tokens": counts,
                        "batch_size": batch,
                        "documents_per_repeat": len(texts),
                        "repeats": args.repeats,
                        "docs_per_second": round(
                            len(texts) * len(times) / sum(times), 3
                        ),
                        "tokens_per_second": round(
                            sum(counts) * len(times) / sum(times), 3
                        ),
                        "repeat_seconds": summary(times),
                        "warm_queries": queries(60),
                        "torch_peak_allocated_mib": round(
                            torch.cuda.max_memory_allocated() / 2**20, 2
                        )
                        if args.device == "cuda"
                        else None,
                        "torch_peak_reserved_mib": round(
                            torch.cuda.max_memory_reserved() / 2**20, 2
                        )
                        if args.device == "cuda"
                        else None,
                        "gpu_samples": gpu,
                        "gpu_peak_is_sampled_lower_bound": True,
                    }
                )
            for placement in ("begin", "middle", "end"):
                passages = [
                    sized_text(text, limit, placement) for _, text in BASE + DISTRACTORS
                ]
                result["quality"].append(rank_quality(passages, f"{limit}-{placement}"))
        model.max_seq_length = limits[0]
        result["quality"].insert(
            0,
            rank_quality(
                [passage_prefix + text for _, text in BASE + DISTRACTORS],
                "short-with-distractors",
            ),
        )
        if args.model == "multilingual-e5-small":
            # Same prefix, differing fact entirely beyond the model's real 512-token window.
            prefix = passage_prefix + FILLER * 80
            a = prefix + "边界事实：测试口令为红杉。"
            b = prefix + "边界事实：测试口令为蓝鲸。"
            kept_a = model.tokenize([a])["input_ids"].tolist()[0]
            kept_b = model.tokenize([b])["input_ids"].tolist()[0]
            vectors = encode([a, b], 1)
            visible = sized_text("边界事实：测试口令为红杉。", 512)
            result["truncation"] = {
                "configured_limit": model.max_seq_length,
                "raw_tokens": [len(tokenizer.encode(t)) for t in (a, b)],
                "kept_tokens": len(kept_a),
                "different_tail_same_input_ids": kept_a == kept_b,
                "different_tail_cosine": round(float(vectors[0] @ vectors[1]), 6),
                "fact_in_visible_chunk_tokens": len(tokenizer.encode(visible)),
                "note": "Special tokens and query/passage prefix consume the 512-token budget; split before encoding",
            }
    result["gpu_before_exit"] = gpu_snapshot() if args.device == "cuda" else None
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Saved {args.output.name}: {args.model}, {args.device}")


if __name__ == "__main__":
    main()
