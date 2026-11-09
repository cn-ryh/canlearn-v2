"""Build local SES template payloads and synthetic previews; makes no network calls."""

import base64
import html
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[3]
OUTPUT = BASE / "generated"
BIOME = REPO / "node_modules" / ".bin" / "biome"
ORIGIN = "https://cl.hangxiaonet.com"
TEMPLATES = (
    (
        "email-verification",
        "canlearn_email_verification_v1",
        "verification_url",
        "/v1/auth/verify-email",
    ),
    ("password-reset", "canlearn_password_reset_v1", "reset_url", "/reset-password"),
)


def build() -> None:
    if not BIOME.is_file():
        raise SystemExit(
            "Install repository dependencies with pnpm install --frozen-lockfile first."
        )
    OUTPUT.mkdir(exist_ok=True)
    for name, template_name, variable, preview_path in TEMPLATES:
        html_source = (BASE / f"{name}.html").read_text(encoding="utf-8")
        text_source = (BASE / f"{name}.txt").read_text(encoding="utf-8")
        found = set(re.findall(r"\{\{([a-z_]+)\}\}", html_source + text_source))
        if found != {variable, f"{variable}_html"}:
            raise ValueError(f"Unexpected variables in {name}: {sorted(found)}")
        payload = {
            "TemplateName": template_name,
            "TemplateContent": {
                "Html": base64.b64encode(html_source.encode("utf-8")).decode("ascii"),
                "Text": base64.b64encode(text_source.encode("utf-8")).decode("ascii"),
            },
        }
        path = OUTPUT / f"create-{name}.json"
        formatted = subprocess.run(
            [str(BIOME), "format", "--stdin-file-path", str(path)],
            input=json.dumps(payload, ensure_ascii=False),
            capture_output=True,
            text=True,
            check=True,
            cwd=REPO,
        )
        path.write_text(formatted.stdout, encoding="utf-8")
        url = (
            f"{ORIGIN}{preview_path}?token=synthetic-preview-only&source=local-preview"
        )
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "cl.hangxiaonet.com":
            raise ValueError("Unexpected preview origin")
        values = {variable: url, f"{variable}_html": html.escape(url, quote=True)}
        preview = html_source
        preview_text = text_source
        for key, value in values.items():
            preview = preview.replace("{{" + key + "}}", value)
            preview_text = preview_text.replace("{{" + key + "}}", value)
        banner = (
            '<p style="padding:12px;text-align:center;font:14px sans-serif;color:#475569;">'
            "本地模板预览；示例链接不能完成真实验证或密码重置。</p>"
        )
        # Preview-only annotation, excluded from the actual SES template payload.
        preview = preview.replace("<table role=", banner + "<table role=", 1)
        (OUTPUT / f"preview-{name}.html").write_text(preview, encoding="utf-8")
        (OUTPUT / f"preview-{name}.txt").write_text(preview_text, encoding="utf-8")
        print(f"Built {template_name}: create payload, HTML and text preview")


if __name__ == "__main__":
    build()
