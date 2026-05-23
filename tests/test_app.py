from fastapi.testclient import TestClient

from lab.app import app

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_homepage():
    response = client.get("/")
    assert response.status_code == 200
    assert "Lab is a small web app" in response.text


def test_blog():
    response = client.get("/blog")
    assert response.status_code == 200
    assert "First deployment note" in response.text


def test_version():
    response = client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "lab"
    assert "version" in data
