import pytest
from fastapi import HTTPException
from app.services.github_fetcher import validate_and_resolve_url

def test_ssrf_rejects_non_https():
    with pytest.raises(HTTPException) as exc_info:
        validate_and_resolve_url("http://github.com/repo/file.txt")
    assert exc_info.value.status_code == 400
    assert "Only HTTPS protocol is permitted" in exc_info.value.detail

def test_ssrf_rejects_disallowed_hosts():
    disallowed_urls = [
        "https://169.254.169.254/latest/meta-data/",
        "https://evil-attacker.com/malicious.py",
        "https://localhost:8000/api",
        "https://google.com/test",
    ]
    for url in disallowed_urls:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_resolve_url(url)
        assert exc_info.value.status_code == 403
        assert "not in the allowed list" in exc_info.value.detail

def test_ssrf_allows_legitimate_github_hosts():
    valid_url = "https://api.github.com/repos/octocat/Hello-World"
    assert validate_and_resolve_url(valid_url) == valid_url

