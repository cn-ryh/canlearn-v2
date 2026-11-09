# /// script
# requires-python = ">=3.12"
# dependencies = ["reportlab==4.4.4"]
# ///
"""Build original, deterministic benchmark PDFs; no competitor API calls."""

import argparse
import hashlib
import json
import re
import subprocess
from itertools import groupby
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = ROOT.parents[2]
SAMPLES = {
    "D01-stack-v1": {
        "feature": "Chinese two-column / 408",
        "pages": [
            [
                ("L1", "栈基础：栈遵循后进先出，入栈叫 push，出栈叫 pop。"),
                (
                    "L2",
                    "空栈 pop 不返回元素，报告下溢；容量为 3 的满栈 push 报告上溢。",
                ),
                ("R1", "示例：空栈依次 push A、push B、pop，移出的元素是 B，剩余 A。"),
                ("R2", "队列与栈不同，队列遵循先进先出。不能把二者同名操作混为一谈。"),
            ],
            [
                (
                    "L3",
                    "数组栈 top 初始为 -1。push 前检查容量，成功后 top 加 1；pop 成功后 top 减 1。",
                ),
                (
                    "R3",
                    "合法操作示例：容量 3，依次放入 A、B、C，再移出 C。此时 top 为 1，栈中有 A、B。",
                ),
            ],
        ],
    },
    "D02-motion-v1": {
        "feature": "formula / physics / intentional arithmetic error",
        "pages": [
            [
                (
                    "F1",
                    "一维匀加速直线运动，正方向固定，加速度保持不变，时间 t 从 0 开始。",
                ),
                ("F2", "速度公式：v = v0 + a*t。位移公式：s = v0*t + (1/2)*a*t^2。"),
                ("F3", "单位：v0 和 v 用 m/s；a 用 m/s^2；t 用 s；位移 s 用 m。"),
            ],
            [
                (
                    "F4",
                    "例题条件：v0 = 2 m/s，a = 3 m/s^2，t = 4 s。末速度 v = 14 m/s。",
                ),
                ("F5", "位移计算：s = 2*4 + (1/2)*3*4^2 = 34 m。"),
                (
                    "F6",
                    "校对提示：请依据公式核验每一处算术结果，不盲信数字。",
                ),
            ],
        ],
    },
    "D02-motion-v2": {
        "feature": "corrected version, uploaded only in correction step",
        "pages": [],
    },
    "D03-reading-v1": {
        "feature": "English reading / CET-style, fictional narrative",
        "pages": [
            [
                (
                    "E1",
                    "Lina studies at a fictional campus library on Tuesday and Thursday, from 18:00 to 19:00.",
                ),
                (
                    "E2",
                    "She studies vocabulary on Tuesday and reads science articles on Thursday. She does not study at the library on Friday.",
                ),
            ],
            [
                (
                    "E3",
                    "Her study partner Omar arrives on Thursday at 18:30 and stays for thirty minutes.",
                ),
                (
                    "E4",
                    "They check unfamiliar words in the article before discussing its main idea. The text gives no exam score or learning-effect estimate.",
                ),
            ],
        ],
    },
    "D04-economics-v1": {
        "feature": "other subject / intentionally missing printed page 41",
        "pages": [
            [
                (
                    "M1",
                    "原讲义页码 40。以下仅为虚构课堂市场，不描述真实经济数据。价格为 10 时，需求量为 80。",
                ),
                ("M2", "价格为 12 时，需求量为 60。除此之外没有给出其他价格点。"),
                (
                    "M3",
                    "原讲义完整页序为 40、41、42；本测试文件缺失原页 41，该页的弹性定义和计算不可见。",
                ),
            ],
            [
                (
                    "M4",
                    "原讲义页码 42。此课堂示例假定其他因素不变，价格升高时需求量降低。",
                ),
                (
                    "M5",
                    "本模型不说明长期需求，也没有任何供给函数。不能据缺失页编造弹性数值或均衡价格。",
                ),
            ],
        ],
    },
}
SAMPLES["D02-motion-v2"]["pages"] = [
    list(page) for page in SAMPLES["D02-motion-v1"]["pages"]
]
SAMPLES["D02-motion-v2"]["pages"][1][1] = (
    "F5",
    "位移计算：s = 2*4 + (1/2)*3*4^2 = 32 m。",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font_for(character: str) -> str:
    # DroidSansFallback omits Latin glyphs; use PDF's standard font for ASCII.
    return "Helvetica" if ord(character) < 128 else "Corpus"


def text_width(text: str, size: int) -> float:
    return sum(pdfmetrics.stringWidth(c, font_for(c), size) for c in text)


def draw_text(doc: canvas.Canvas, text: str, x: float, y: float, size: int) -> None:
    for font, characters in groupby(text, key=font_for):
        part = "".join(characters)
        doc.setFont(font, size)
        doc.drawString(x, y, part)
        x += text_width(part, size)


def wrapped(text: str, width: float) -> list[str]:
    lines, current = [], ""
    for token in re.findall(r"[A-Za-z0-9]+|\s+|.", text):
        if current and text_width(current + token, 12) > width:
            lines.append(current.rstrip())
            current = ""
        current += token if current else token.lstrip()
    return [*lines, current]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--font",
        type=Path,
        default=Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
    )
    args = parser.parse_args()
    if not args.font.is_file():
        parser.error(
            "Droid Sans Fallback font missing; supply --font with the same licensed font"
        )
    biome = REPOSITORY_ROOT / "node_modules" / ".bin" / "biome"
    if not biome.is_file():
        parser.error(
            "Biome missing; run pnpm install --frozen-lockfile at the repository root"
        )
    pdfmetrics.registerFont(TTFont("Corpus", str(args.font)))
    output = ROOT / "fixtures"
    output.mkdir(exist_ok=True)
    manifest = {
        "version": "1.0",
        "synthetic": True,
        "generator_sha256": sha(Path(__file__)),
        "font_sha256": sha(args.font),
        "samples": [],
    }
    width, height = A4
    for sample_id, data in SAMPLES.items():
        path = output / f"{sample_id}.pdf"
        doc = canvas.Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1)
        doc.setTitle(sample_id)
        doc.setAuthor("CanLearn original synthetic benchmark fixture")
        anchors = []
        for page_number, blocks in enumerate(data["pages"], 1):
            draw_text(doc, f"{sample_id} / PDF page {page_number}", 40, height - 45, 14)
            draw_text(
                doc, "原创合成测试资料 / 非真题、非正式教学内容", 40, height - 65, 10
            )
            columns = {"L": height - 110, "R": height - 110, "single": height - 110}
            if sample_id.startswith("D01"):
                doc.line(width / 2, 100, width / 2, height - 90)
            for anchor, text in blocks:
                column = anchor[0] if sample_id.startswith("D01") else "single"
                x = width / 2 + 20 if column == "R" else 40
                block_width = width / 2 - 65 if column in {"L", "R"} else width - 80
                y = columns[column]
                lines = wrapped(f"[{anchor}] {text}", block_width)
                for line in lines:
                    draw_text(doc, line, x, y, 12)
                    y -= 20
                if y < 100:
                    raise ValueError(f"Block {sample_id}/{anchor} overflows page")
                anchors.append(
                    {
                        "id": anchor,
                        "pdf_page": page_number,
                        "text": text,
                        "bbox_top_left": [
                            x,
                            height - columns[column] - 14,
                            x + block_width,
                            height - y,
                        ],
                    }
                )
                columns[column] = y - 25
            draw_text(
                doc,
                "Font subset: Droid Sans Fallback; Apache-2.0 notices accompany corpus",
                40,
                40,
                9,
            )
            doc.showPage()
        doc.save()
        manifest["samples"].append(
            {
                "id": sample_id,
                "file": path.name,
                "sha256": sha(path),
                "pages": len(data["pages"]),
                "feature": data["feature"],
                "anchors": anchors,
            }
        )
    manifest_path = output / "manifest.json"
    formatted = subprocess.run(
        [str(biome), "format", "--stdin-file-path", str(manifest_path)],
        input=json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        stdout=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        check=True,
        cwd=REPOSITORY_ROOT,
    )
    manifest_path.write_text(formatted.stdout, encoding="utf-8")
    print(f"Built {len(manifest['samples'])} PDFs and manifest at {output}")


if __name__ == "__main__":
    main()
