"""Bounded self-hosted MinerU 4.0.7 V1 client. No POST retry or cross-origin transfers."""

import asyncio
import hashlib
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

STATUSES = frozenset({"queued", "running", "completed", "partial", "failed", "canceled"})
TERMINAL = STATUSES - {"queued", "running"}
FORMATS = ("markdown", "middle_json", "structured_content")


class MineruError(Exception):
    def __init__(self, code: str, http_status: int | None = None) -> None:
        self.code = code
        self.http_status = http_status
        super().__init__(
            code
        )  # Never include upstream bodies, URLs, keys or original document text.


def identifier(value: Any, prefix: str) -> str:
    if (
        not isinstance(value, str)
        or not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", value)
        or not value.startswith(prefix)
    ):
        raise MineruError("MINERU_PROTOCOL_INVALID")
    return value


def _object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise MineruError("MINERU_PROTOCOL_INVALID")
    return value


@dataclass(frozen=True)
class Artifact:
    format: str
    file_id: str
    bytes: int
    sha256: str

    def receipt(self) -> dict[str, Any]:
        return {
            "format": self.format,
            "fileId": self.file_id,
            "bytes": self.bytes,
            "sha256": self.sha256,
        }


class MineruClient:
    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        *,
        timeout: float = 10,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        parsed = urlparse(base_url)
        if (
            not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
        ):
            raise MineruError("MINERU_ENDPOINT_INVALID")
        if parsed.scheme != "https" and not (
            parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")
        ):
            raise MineruError("MINERU_TLS_REQUIRED")
        self.base_url = base_url.rstrip("/") + "/"
        self.origin = (
            parsed.scheme,
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
        )
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=timeout,
            follow_redirects=False,
            transport=transport,
            # Preserve platform proxy/CA trust for HTTPS; loopback must stay on the local socket.
            trust_env=parsed.scheme == "https",
        )

    async def __aenter__(self) -> "MineruClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.client.aclose()

    def transfer_url(self, value: Any, upload_id: str) -> str:
        if not isinstance(value, str):
            raise MineruError("MINERU_TRANSFER_REJECTED")
        url = urljoin(self.base_url, value)
        parsed = urlparse(url)
        origin = (
            parsed.scheme,
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
        )
        if (
            origin != self.origin
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path != f"/v1/uploads/{upload_id}/content"
        ):
            raise MineruError("MINERU_TRANSFER_REJECTED")
        return url

    async def json(
        self, method: str, path: str, body: Any = None, expected: int = 200
    ) -> dict[str, Any]:
        try:
            async with self.client.stream(method, path, json=body) as response:
                if response.status_code != expected:
                    raise MineruError(
                        "MINERU_RESOURCE_LOST"
                        if response.status_code == 404
                        else "MINERU_HTTP_REJECTED",
                        response.status_code,
                    )
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 1024 * 1024:
                        raise MineruError("MINERU_RESPONSE_TOO_LARGE")
                import json

                try:
                    return _object(json.loads(content))
                except (ValueError, UnicodeDecodeError) as exc:
                    raise MineruError("MINERU_PROTOCOL_INVALID") from exc
        except httpx.HTTPError as exc:
            raise MineruError("MINERU_TRANSPORT_UNKNOWN") from exc

    async def health(self) -> dict[str, Any]:
        value = await self.json("GET", "v1/health")
        features = _object(value.get("features"))
        if (
            value.get("status") != "ok"
            or value.get("version") != "4.0.7"
            or "file_id" not in features.get("sources", [])
            or not set(FORMATS).issubset(features.get("output_formats", []))
        ):
            raise MineruError("MINERU_CAPABILITY_MISMATCH")
        return value

    async def upload(self, path: Path, expected_sha256: str) -> str:
        size = path.stat().st_size
        if not 0 < size <= 5 * 1024 * 1024:
            raise MineruError("MINERU_FIXTURE_TOO_LARGE")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected_sha256:
            raise MineruError("MINERU_FIXTURE_HASH_MISMATCH")
        upload = await self.json(
            "POST",
            "v1/uploads",
            {
                "filename": path.name,
                "bytes": size,
                "mime_type": "application/pdf",
                "purpose": "parse",
                "sha256sum": expected_sha256,
            },
        )
        upload_id = identifier(upload.get("id"), "upload_")
        if upload.get("status") == "pending":
            url = self.transfer_url(upload.get("upload_url"), upload_id)
            headers = _object(upload.get("upload_headers"))
            if upload.get("upload_method") != "PUT" or any(
                not isinstance(k, str)
                or not isinstance(v, str)
                or k.lower() in ("authorization", "cookie", "host", "proxy-authorization")
                for k, v in headers.items()
            ):
                raise MineruError("MINERU_TRANSFER_REJECTED")
            try:
                response = await self.client.put(url, headers=headers, content=data)
            except httpx.HTTPError as exc:
                raise MineruError("MINERU_TRANSPORT_UNKNOWN") from exc
            if response.status_code != 200:
                raise MineruError("MINERU_TRANSFER_REJECTED")
            upload = await self.json(
                "POST", f"v1/uploads/{upload_id}/complete", {"sha256sum": expected_sha256}
            )
        if upload.get("status") != "completed" or upload.get("id") != upload_id:
            raise MineruError("MINERU_PROTOCOL_INVALID")
        file = _object(upload.get("file"))
        if (
            file.get("purpose") != "parse"
            or file.get("bytes") != size
            or file.get("sha256sum") != expected_sha256
        ):
            raise MineruError("MINERU_FILE_INTEGRITY_MISMATCH")
        return identifier(file.get("id"), "file-")

    async def create_job(self, file_id: str, pages: int, tier: str) -> dict[str, Any]:
        if type(pages) is not int or not 1 <= pages <= 300 or tier not in ("flash", "basic"):
            raise MineruError("MINERU_PROBE_INPUT_INVALID")
        value = await self.json(
            "POST",
            "v1/parse/jobs",
            {
                "files": [
                    {
                        "source": {"type": "file_id", "file_id": identifier(file_id, "file-")},
                        "page_range": f"1-{pages}",
                    }
                ],
                "tier": tier,
                "ocr_mode": "auto",
                "output_formats": list(FORMATS),
            },
            202,
        )
        return self.validate_job(value)

    def validate_job(self, value: dict[str, Any]) -> dict[str, Any]:
        identifier(value.get("job_id"), "job_")
        files = value.get("files")
        if value.get("status") not in STATUSES or not isinstance(files, list) or len(files) != 1:
            raise MineruError("MINERU_PROTOCOL_INVALID")
        file = _object(files[0])
        if file.get("status") not in STATUSES:
            raise MineruError("MINERU_PROTOCOL_INVALID")
        return value

    async def get_job(self, job_id: str) -> dict[str, Any]:
        value = self.validate_job(
            await self.json("GET", f"v1/parse/jobs/{identifier(job_id, 'job_')}")
        )
        if value["job_id"] != job_id:
            raise MineruError("MINERU_PROTOCOL_INVALID")
        return value

    async def wait(
        self, job_id: str, *, seconds: float = 600, interval: float = 0.25
    ) -> dict[str, Any]:
        if not 0 < seconds <= 600 or not 0 <= interval <= 5:
            raise MineruError("MINERU_POLL_BUDGET_INVALID")
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = await self.get_job(job_id)
            if value["status"] in TERMINAL:
                return value
            await asyncio.sleep(min(interval, max(0, deadline - time.monotonic())))
        raise MineruError("MINERU_POLL_TIMEOUT")  # Does not cancel/recreate the upstream job.

    async def cancel(self, job_id: str) -> dict[str, Any]:
        value = await self.json("DELETE", f"v1/parse/jobs/{identifier(job_id, 'job_')}")
        if value.get("job_id") != job_id or value.get("status") != "canceled":
            raise MineruError("MINERU_PROTOCOL_INVALID")
        return value  # Logical acknowledgement, not proof of physical GPU stop.

    async def download(self, file_id: str, format: str, folder: Path) -> Artifact:
        if format not in FORMATS:
            raise MineruError("MINERU_OUTPUT_FORMAT_INVALID")
        file_id = identifier(file_id, "file-")
        metadata = await self.json("GET", f"v1/files/{file_id}")
        size = metadata.get("bytes")
        expected_hash = metadata.get("sha256sum")
        if (
            metadata.get("id") != file_id
            or metadata.get("purpose") != "parse_output"
            or type(size) is not int
            or not 0 < size <= 32 * 1024 * 1024
            or not isinstance(expected_hash, str)
            or not re.fullmatch(r"[0-9a-f]{64}", expected_hash)
        ):
            raise MineruError("MINERU_FILE_INTEGRITY_MISMATCH")
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        destination = folder / f"{file_id}.{format}"
        temporary = folder / f"{file_id}.{format}.part"
        digest = hashlib.sha256()
        received = 0
        try:
            async with self.client.stream("GET", f"v1/files/{file_id}/content") as response:
                if response.status_code != 200:
                    raise MineruError("MINERU_DOWNLOAD_REJECTED", response.status_code)
                with temporary.open("wb") as stream:
                    os.chmod(temporary, 0o600)
                    async for chunk in response.aiter_bytes():
                        received += len(chunk)
                        if received > size:
                            raise MineruError("MINERU_FILE_INTEGRITY_MISMATCH")
                        digest.update(chunk)
                        stream.write(chunk)
            if received != size or digest.hexdigest() != expected_hash:
                raise MineruError("MINERU_FILE_INTEGRITY_MISMATCH")
            temporary.replace(destination)
        except httpx.HTTPError as exc:
            raise MineruError("MINERU_TRANSPORT_UNKNOWN") from exc
        finally:
            temporary.unlink(missing_ok=True)
        return Artifact(format, file_id, received, digest.hexdigest())
