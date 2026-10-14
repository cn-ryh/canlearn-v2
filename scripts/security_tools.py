"""Install pinned, checksum-verified Linux x86_64 scanner binaries outside the repository."""

import hashlib
import io
import json
import os
import platform
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("CANLEARN_SECURITY_CACHE", "/tmp/canlearn-security-tools"))


def tool(name: str) -> str:
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
        raise RuntimeError("Pinned security tools currently require Linux x86_64")
    spec = json.loads((ROOT / "security/tools.json").read_text())[name]
    directory = CACHE / f"{name}-{spec['version']}-{spec['sha256'][:12]}"
    executable = directory / name
    # Recheck the archive and extracted binary, including on a cache hit.
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    archive = directory / "release.tar.gz"
    if not archive.exists():
        request = urllib.request.Request(
            spec["url"], headers={"User-Agent": "canlearn-ci"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != spec["sha256"]:
            raise RuntimeError(f"{name} release checksum mismatch")
        archive.write_bytes(content)
    content = archive.read_bytes()
    if hashlib.sha256(content).hexdigest() != spec["sha256"]:
        raise RuntimeError(f"{name} cached release checksum mismatch")
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as bundle:
        member = bundle.getmember(name)
        if not member.isfile():
            raise RuntimeError("Scanner archive member is not a regular file")
        stream = bundle.extractfile(member)
        assert stream
        binary = stream.read()
    if not executable.exists() or executable.read_bytes() != binary:
        executable.write_bytes(binary)
        executable.chmod(0o700)
    return str(executable)


if __name__ == "__main__":
    for scanner in ("gitleaks", "trivy"):
        print(f"Installed {scanner}: {tool(scanner)}", flush=True)
