"""Evaluate pinned local multilingual embedding candidates on synthetic retrieval pairs."""

import argparse
import gc
import hashlib
import json
import os
import statistics
import time
from pathlib import Path

import torch
from sentence_transformers import SentenceTransformer

MODELS = {
    "bge-m3": {
        "repo": "BAAI/bge-m3",
        "revision": "5617a9f61b028005a4858fdac845db406aefb181",
        "query_prefix": "",
        "passage_prefix": "",
    },
    "multilingual-e5-small": {
        "repo": "intfloat/multilingual-e5-small",
        "revision": "614241f622f53c4eeff9890bdc4f31cfecc418b3",
        "query_prefix": "query: ",
        "passage_prefix": "passage: ",
    },
}

DOCUMENTS = [
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
QUERIES = [
    ("栈的后进先出操作", {"stack"}),
    ("队列从哪里加入和移出元素", {"queue"}),
    ("加速度与位移公式", {"motion"}),
    ("向量索引和来源页码权限", {"retrieval"}),
    ("删除资料后的派生副本", {"deletion"}),
    ("答错是否能留下学习证据", {"evidence"}),
    ("私有文件能否用于训练和其他用户搜索", {"privacy"}),
    ("更正来源后历史作答和旧结果", {"versioning"}),
    ("Which structure removes the most recently inserted item first?", {"stack"}),
    ("How does a FIFO queue add and remove items?", {"queue"}),
    ("Displacement under constant acceleration", {"motion"}),
    ("Source page references and access control in vector search", {"retrieval"}),
    ("Remove source documents and their derived copies", {"deletion"}),
    ("Can an incorrect answer still provide evidence of learning?", {"evidence"}),
    ("May private files be used for training or other users' search?", {"privacy"}),
    ("Corrected source versions must not overwrite past answers", {"versioning"}),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def manifest(cache: Path) -> list[dict[str, str | int]]:
    output = []
    for path in sorted(p for p in cache.rglob("*") if p.is_file()):
        relative = path.relative_to(cache)
        if relative.parts and relative.parts[0] in {".locks", "blobs"}:
            continue
        if "snapshots" not in relative.parts:
            continue
        output.append(
            {
                "path": str(relative),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model", choices=sorted(MODELS), action="append", default=None
    )
    parser.add_argument("--output", type=Path, default=Path("results.json"))
    parser.add_argument("--cache", type=Path, default=Path("./model-cache"))
    parser.add_argument("--batch-size", type=int, default=4)
    args = parser.parse_args()
    selected = args.model or list(MODELS)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    results = {"device": device, "torch": torch.__version__, "models": []}
    for name in selected:
        spec = MODELS[name]
        os.environ["HF_HOME"] = str(args.cache.resolve())
        start_load = time.perf_counter()
        model = SentenceTransformer(
            spec["repo"],
            revision=spec["revision"],
            device=device,
            cache_folder=str(args.cache),
        )
        load_seconds = time.perf_counter() - start_load
        model.eval()
        passages = [spec["passage_prefix"] + text for _, text in DOCUMENTS]
        queries = [spec["query_prefix"] + text for text, _ in QUERIES]
        if device == "cuda":
            torch.cuda.synchronize()
            torch.cuda.reset_peak_memory_stats()
        start = time.perf_counter()
        passage_vectors = model.encode(
            passages,
            batch_size=args.batch_size,
            normalize_embeddings=True,
            convert_to_tensor=True,
            show_progress_bar=False,
        )
        if device == "cuda":
            torch.cuda.synchronize()
        passage_seconds = time.perf_counter() - start
        if device == "cuda":
            torch.cuda.synchronize()
        start = time.perf_counter()
        query_vectors = model.encode(
            queries,
            batch_size=args.batch_size,
            normalize_embeddings=True,
            convert_to_tensor=True,
            show_progress_bar=False,
        )
        if device == "cuda":
            torch.cuda.synchronize()
        query_seconds = time.perf_counter() - start
        scores = query_vectors @ passage_vectors.T
        ranked = scores.argsort(dim=1, descending=True).detach().cpu().tolist()
        labels = [item[0] for item in DOCUMENTS]
        recall = {}
        reciprocal = []
        top = []
        for (_, expected), order in zip(QUERIES, ranked, strict=True):
            expected_indexes = {labels.index(key) for key in expected}
            rank = next(
                (i + 1 for i, item in enumerate(order) if item in expected_indexes),
                len(order) + 1,
            )
            reciprocal.append(1 / rank if rank <= len(order) else 0)
            top.append([labels[item] for item in order[:3]])
        for k in (1, 3, 5):
            recall[f"recall@{k}"] = sum(
                1
                for (_, expected), order in zip(QUERIES, ranked, strict=True)
                if expected.intersection(labels[item] for item in order[:k])
            ) / len(QUERIES)
        single_query_ms = []
        for query in queries[:8]:
            if device == "cuda":
                torch.cuda.synchronize()
            single_start = time.perf_counter()
            model.encode([query], normalize_embeddings=True, show_progress_bar=False)
            if device == "cuda":
                torch.cuda.synchronize()
            single_query_ms.append((time.perf_counter() - single_start) * 1000)
        model_result = {
            "name": name,
            "repo": spec["repo"],
            "revision": spec["revision"],
            "device": device,
            "load_seconds": round(load_seconds, 3),
            "passage_seconds": round(passage_seconds, 3),
            "query_seconds": round(query_seconds, 3),
            "passage_ms_each": round(passage_seconds / len(passages) * 1000, 3),
            "query_ms_each": round(query_seconds / len(queries) * 1000, 3),
            "embedding_dimensions": int(passage_vectors.shape[-1]),
            "recall": recall,
            "mrr": round(statistics.mean(reciprocal), 4),
            "top3": top,
            "warm_single_query_ms": [round(value, 3) for value in single_query_ms],
            "warm_single_query_median_ms": round(statistics.median(single_query_ms), 3),
            "scope_note": "8 original passages / 16 related Chinese and English queries; smoke test, not production benchmark",
            "peak_cuda_allocated_bytes": torch.cuda.max_memory_allocated()
            if device == "cuda"
            else None,
            "peak_cuda_reserved_bytes": torch.cuda.max_memory_reserved()
            if device == "cuda"
            else None,
            "cache_manifest": manifest(args.cache),
            "synthetic_only": True,
        }
        results["models"].append(model_result)
        del model, passage_vectors, query_vectors, scores
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    args.output.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
