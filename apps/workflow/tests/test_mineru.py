"""Protocol fault tests use MockTransport; genuine CPU/GPU HTTP evidence is recorded separately."""

import hashlib
import json
from pathlib import Path

import httpx
import pytest

from canlearn_workflow.mineru import MineruClient, MineruError
from canlearn_workflow.mineru_probe import page_indices


@pytest.mark.parametrize(
    "url",
    [
        "http://192.0.2.1:8000",
        "https://user:password@service.invalid",
        "http://127.0.0.1:8000/?key=synthetic",
        "file:///tmp/test",
        "https://service.invalid/v1",
    ],
)
def test_endpoint_rejects_plain_remote_or_credential_urls(url: str) -> None:
    with pytest.raises(MineruError):
        MineruClient(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://untrusted.invalid/v1/uploads/upload_test/content",
        "http://127.0.0.1:8001/v1/uploads/upload_test/content",
        "http://127.0.0.1:8000/v1/uploads/upload_other/content",
        "/v1/uploads/upload_test/content?key=synthetic",
    ],
)
async def test_upload_destination_is_closed_before_byte_or_key_transfer(
    url: str, tmp_path: Path
) -> None:
    pdf = tmp_path / "fixture.pdf"
    pdf.write_bytes(b"original protocol fixture")
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "upload_test",
                "status": "pending",
                "upload_url": url,
                "upload_method": "PUT",
                "upload_headers": {"content-type": "application/pdf"},
            },
        )

    async with MineruClient(
        "http://127.0.0.1:8000", "nonexistent-client-key", transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(MineruError, match="TRANSFER_REJECTED"):
            await client.upload(pdf, hashlib.sha256(pdf.read_bytes()).hexdigest())
    assert len(requests) == 1


async def test_digest_reuse_skips_byte_upload_and_completion(tmp_path: Path) -> None:
    pdf = tmp_path / "fixture.pdf"
    pdf.write_bytes(b"original fixture")
    sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "upload_cached",
                "status": "completed",
                "file": {
                    "id": "file-cached",
                    "purpose": "parse",
                    "bytes": pdf.stat().st_size,
                    "sha256sum": sha,
                },
            },
        )

    async with MineruClient(
        "http://127.0.0.1:8000", transport=httpx.MockTransport(handler)
    ) as client:
        assert await client.upload(pdf, sha) == "file-cached"
    assert [r.method for r in requests] == ["POST"]


async def test_parse_create_transport_uncertainty_never_retries_post() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert json.loads(request.content)["files"][0]["page_range"] == "1-300"
        raise httpx.ReadTimeout("synthetic upstream uncertainty", request=request)

    async with MineruClient(
        "http://127.0.0.1:8000", transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(MineruError, match="TRANSPORT_UNKNOWN"):
            await client.create_job("file-original", 300, "basic")
    assert calls == 1


@pytest.mark.parametrize(
    "value",
    [
        {"job_id": None, "status": "queued", "files": []},
        {"job_id": "job_test", "status": "unknown", "files": [{"status": "queued"}]},
    ],
)
async def test_invalid_success_body_does_not_enter_polling(value: dict) -> None:
    async with MineruClient(
        "http://127.0.0.1:8000",
        transport=httpx.MockTransport(lambda request: httpx.Response(202, json=value)),
    ) as client:
        with pytest.raises(MineruError, match="PROTOCOL_INVALID"):
            await client.create_job("file-original", 2, "flash")


async def test_poll_budget_only_queries_existing_task() -> None:
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        return httpx.Response(
            200,
            json={
                "job_id": "job_original",
                "status": "running",
                "files": [{"file_id": "file-original", "status": "running"}],
            },
        )

    async with MineruClient(
        "http://127.0.0.1:8000", transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(MineruError, match="POLL_TIMEOUT"):
            await client.wait("job_original", seconds=0.02, interval=0.005)
    assert calls and all(
        method == "GET" and path.endswith("job_original") for method, path in calls
    )


async def test_upstream_restart_missing_task_is_explicit() -> None:
    async with MineruClient(
        "http://127.0.0.1:8000",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(404, json={"error": {"code": "job_not_found"}})
        ),
    ) as client:
        with pytest.raises(MineruError, match="RESOURCE_LOST"):
            await client.get_job("job_original")


@pytest.mark.parametrize("fault", ["digest", "redirect", "oversized"])
async def test_download_failure_leaves_no_partial_or_corrupt_artifact(
    fault: str, tmp_path: Path
) -> None:
    data = b"fixed original artifact"
    sha = hashlib.sha256(data).hexdigest()
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host)
        if request.url.path.endswith("/content"):
            if fault == "redirect":
                return httpx.Response(302, headers={"location": "https://untrusted.invalid/secret"})
            return httpx.Response(200, content=data + b"extra" if fault == "oversized" else data)
        return httpx.Response(
            200,
            json={
                "id": "file-output",
                "purpose": "parse_output",
                "bytes": len(data),
                "sha256sum": "0" * 64 if fault == "digest" else sha,
            },
        )

    async with MineruClient(
        "http://127.0.0.1:8000", "nonexistent-key", transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(MineruError):
            await client.download("file-output", "markdown", tmp_path)
    assert list(tmp_path.iterdir()) == []
    assert set(calls) == {"127.0.0.1"}


@pytest.mark.parametrize("indices", [[0, 0], [0, 2], [-1, 1], [True, 1]])
def test_middle_json_page_receipt_rejects_duplicate_missing_or_out_of_range_indices(
    indices: list, tmp_path: Path
) -> None:
    path = tmp_path / "middle.json"
    path.write_text(
        json.dumps(
            {
                "schema": "docvortex.middle",
                "schema_version": "2.0",
                "metadata": {"producer": {"name": "mineru", "version": "4.0.7"}},
                "pages": [{"page_idx": index} for index in indices],
            }
        )
    )
    with pytest.raises(MineruError):
        page_indices(path, 2)
