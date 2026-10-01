import os
import tempfile

# Configure an isolated, credential-free environment before the app is imported.
_tmp = tempfile.mkdtemp()
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{_tmp}/test.db",
        "ENVIRONMENT": "test",
        "SESSION_SECRET": "test-secret-0123456789",
        "SPOTIFY_CLIENT_ID": "",
        "SPOTIFY_CLIENT_SECRET": "",
        "ANTHROPIC_API_KEY": "",
        "GENERATE_RATE_LIMIT_PER_MINUTE": "100",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def demo_client(client):
    response = client.post("/auth/demo")
    assert response.status_code == 200
    return client
