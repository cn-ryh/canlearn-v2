# /// script
# requires-python = ">=3.12"
# dependencies = ["reportlab==4.4.4", "pypdf==6.1.1"]
# ///
"""Build a deterministic original 300-page volume probe, not a real textbook."""

import hashlib
import json
import shutil
import subprocess
from itertools import groupby
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
OUTPUT = ROOT / "fixtures"
FONT = Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf")
BIOME = REPO / "node_modules" / ".bin" / "biome"
TOPICS = (
    ("栈与队列", "栈采用后进先出，队列采用先进先出。"),
    ("匀加速运动", "速度变化等于加速度与经过时间的乘积。"),
    ("学习与回忆", "记录来源与作答，区分提示、回忆和真实完成。"),
    ("版本与删除", "旧版本用于历史核对，删除后不再作为新处理输入。"),
)


def draw(doc: canvas.Canvas, text: str, x: int, y: int, size: int = 11) -> None:
    for font, chars in groupby(
        text, key=lambda c: "Helvetica" if ord(c) < 128 else "Volume"
    ):
        part = "".join(chars)
        doc.setFont(font, size)
        doc.drawString(x, y, part)
        x += pdfmetrics.stringWidth(part, font, size)


def main() -> None:
    if not FONT.is_file() or not BIOME.is_file():
        raise SystemExit(
            "Requires Droid Sans Fallback font and pnpm install --frozen-lockfile"
        )
    OUTPUT.mkdir(exist_ok=True)
    pdfmetrics.registerFont(TTFont("Volume", str(FONT)))
    path = OUTPUT / "L300-original-volume-v1.pdf"
    doc = canvas.Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1)
    doc.setTitle("CanLearn original synthetic 300-page volume probe v1")
    doc.setAuthor("CanLearn synthetic fixture generator")
    for page in range(1, 301):
        topic, statement = TOPICS[(page - 1) % len(TOPICS)]
        draw(doc, "CanLearn 原创合成容量测试 · 非真实教材", 40, 796, 15)
        draw(doc, f"PAGE-ANCHOR-{page:03d} · 第 {page} 页 · {topic}", 40, 766, 12)
        for line in range(1, 17):
            draw(doc, f"记录 {page:03d}-{line:02d}：{statement}", 40, 728 - line * 30)
        draw(
            doc,
            f"TRACE-{page:03d}: Original synthetic text for workload observation.",
            40,
            165,
        )
        draw(
            doc,
            "Repeated simple layouts do not represent difficult textbook parsing.",
            40,
            135,
        )
        draw(doc, "300 页仅用于长任务观察，不要求 MinerU 一定解析成功。", 40, 105)
        draw(
            doc,
            "Droid font subset: Apache-2.0; notices accompany this fixture.",
            40,
            50,
            9,
        )
        doc.showPage()
    doc.save()
    reader = PdfReader(path)
    if len(reader.pages) != 300:
        raise ValueError("Unexpected page count")
    for page, item in enumerate(reader.pages, 1):
        text = item.extract_text()
        if f"PAGE-ANCHOR-{page:03d}" not in text or "原创合成容量测试" not in text:
            raise ValueError(f"Missing anchor or Chinese text on page {page}")
    for name in ("FONT-LICENSE.txt", "FONT-NOTICE.txt"):
        shutil.copyfile(REPO / "docs/research/CL-003/fixtures" / name, OUTPUT / name)
    manifest = {
        "version": "1.0",
        "synthetic": True,
        "pages": 300,
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "size_bytes": path.stat().st_size,
        "generator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "font_sha256": hashlib.sha256(FONT.read_bytes()).hexdigest(),
        "anchor_pattern": "PAGE-ANCHOR-{page:03d}; one anchor per PDF page",
        "content": "original, simple text, repeated layout; not a real or complex textbook",
        "mineru_attempted": False,
        "parsing_success_required": False,
        "intended_observations": [
            "admission/rejection reason and bounded resource use",
            "page coverage, visible partial/failure state and missing-page accounting",
            "timeout, cancellation, resume, duplicate submission and cleanup",
            "index eligibility and source traceability after accepted pages",
        ],
    }
    manifest_path = OUTPUT / "manifest.json"
    formatted = subprocess.run(
        [str(BIOME), "format", "--stdin-file-path", str(manifest_path)],
        input=json.dumps(manifest, ensure_ascii=False),
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO,
    )
    manifest_path.write_text(formatted.stdout, encoding="utf-8")
    print(
        f"Built {path.name}: 300 pages, all anchors verified, {path.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
