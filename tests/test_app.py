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
    assert '<main class="content-shell">' in response.text
    assert 'href="/static/styles.css"' in response.text


def test_static_styles_cover_content_sections():
    response = client.get("/static/styles.css")
    assert response.status_code == 200
    assert ".content-shell" in response.text
    assert ".hero" in response.text
    assert ".card-grid article" in response.text


def test_mobile_header_stays_single_row_when_sticky():
    response = client.get("/static/styles.css")
    assert response.status_code == 200
    assert ".site-header" in response.text
    assert "left: 0;" in response.text
    assert "right: 0;" in response.text
    assert "overflow-x: auto;" in response.text
    assert "flex-direction: column;" not in response.text


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
