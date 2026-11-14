"""api: shared-secret token on write endpoints and the cross-process pipeline lock."""
import json
import os
import subprocess
import time

import pytest
from fastapi.testclient import TestClient

from engine import api


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "LOCK", tmp_path / ".pipeline.lock")
    monkeypatch.setattr(api, "LATEST", tmp_path)
    (tmp_path / "runs.json").write_text(json.dumps([{"id": "r1", "mode": "live"}]), encoding="utf-8")
    monkeypatch.setattr(api.subprocess, "run",
                        lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="ok", stderr=""))
    return TestClient(api.app)


def test_open_endpoints(client, monkeypatch):
    monkeypatch.delenv("CANARY_API_TOKEN", raising=False)
    assert client.get("/health").status_code == 200


def test_writes_refused_without_server_token(client, monkeypatch):
    monkeypatch.delenv("CANARY_API_TOKEN", raising=False)
    r = client.post("/run", headers={"X-Canary-Token": "anything"})
    assert r.status_code == 503 and "CANARY_API_TOKEN" in r.text
    assert client.post("/corrections", json={"loan_id": "L01", "signal_kind": "x"}).status_code == 503


def test_wrong_or_missing_token(client, monkeypatch):
    monkeypatch.setenv("CANARY_API_TOKEN", "s3cret")
    assert client.post("/run").status_code == 401
    assert client.post("/run", headers={"X-Canary-Token": "nope"}).status_code == 401
    assert client.post("/corrections", json={"loan_id": "L01", "signal_kind": "x"},
                       headers={"X-Canary-Token": "nope"}).status_code == 401


def test_run_with_token_releases_lock(client, monkeypatch):
    monkeypatch.setenv("CANARY_API_TOKEN", "s3cret")
    r = client.post("/run", headers={"X-Canary-Token": "s3cret"})
    assert r.status_code == 200 and r.json()["run_id"] == "r1"
    assert not api.LOCK.exists()


def test_second_run_conflicts(client, monkeypatch):
    monkeypatch.setenv("CANARY_API_TOKEN", "s3cret")
    api.LOCK.write_text("1234")
    assert client.post("/run", headers={"X-Canary-Token": "s3cret"}).status_code == 409
    assert api.LOCK.exists()  # someone else's lock is left alone


def test_stale_lock_taken_over(client, monkeypatch):
    monkeypatch.setenv("CANARY_API_TOKEN", "s3cret")
    api.LOCK.write_text("1234")
    old = time.time() - 3600
    os.utime(api.LOCK, (old, old))
    assert client.post("/run", headers={"X-Canary-Token": "s3cret"}).status_code == 200
