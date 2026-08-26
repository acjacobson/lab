from pathlib import Path

from fastapi.testclient import TestClient

from lab.app import app

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_homepage_is_lab_index():
    response = client.get("/")
    assert response.status_code == 200
    assert "Stray Lantern Lab" in response.text
    assert 'class="project-grid"' in response.text
    assert 'href="/games/lighthouse/"' in response.text
    assert "The Last Lighthouse Keeper" in response.text
    assert 'href="/static/lab.css"' in response.text


def test_lighthouse_game_has_dedicated_route_and_assets():
    response = client.get("/games/lighthouse/")
    assert response.status_code == 200
    assert "The Last Lighthouse Keeper" in response.text
    assert '<main class="game-shell">' in response.text
    assert 'href="/static/games/lighthouse/styles.css"' in response.text
    assert 'src="/static/games/lighthouse/game-ui.js"' in response.text
    assert 'href="/"' in response.text


def test_lighthouse_route_without_trailing_slash_redirects():
    response = client.get("/games/lighthouse", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert response.headers["location"] == "/games/lighthouse/"


def test_sailing_game_has_phone_playable_route_and_assets():
    response = client.get("/games/sailing/")
    assert response.status_code == 200
    assert "Sailing" in response.text
    assert '<canvas id="game-canvas"' in response.text
    assert 'aria-label="Sailing controls"' in response.text
    assert 'src="/static/games/sailing/game.js"' in response.text
    assert 'href="/static/games/sailing/styles.css"' in response.text

    engine = client.get("/static/games/sailing/game-engine.mjs")
    assert engine.status_code == 200
    assert "createGame" in engine.text


def test_sailing_route_without_trailing_slash_redirects():
    response = client.get("/games/sailing", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert response.headers["location"] == "/games/sailing/"


def test_lighthouse_static_assets_cover_game_interface():
    response = client.get("/static/games/lighthouse/styles.css")
    assert response.status_code == 200
    assert ".game-shell" in response.text
    assert ".transcript" in response.text
    assert ".command-form" in response.text
    assert "@media (max-width: 700px)" in response.text
    assert "min-height: 48px" in response.text

    script = client.get("/static/games/lighthouse/game-ui.js")
    assert script.status_code == 200
    assert "game-engine.mjs" in script.text

    engine = client.get("/static/games/lighthouse/game-engine.mjs")
    assert engine.status_code == 200
    assert "createGame" in engine.text


def test_repository_commands_cover_game_engine_and_live_routes():
    root = Path(__file__).parent.parent
    test_script = (root / "scripts" / "test.sh").read_text()
    smoke_script = (root / "scripts" / "smoke.sh").read_text()

    assert "node --test tests/game_engine.test.mjs" in test_script
    assert "node --test tests/sailing_engine.test.mjs" in test_script
    assert 'Stray Lantern Lab' in smoke_script
    assert '/games/lighthouse/' in smoke_script
    assert '/games/sailing/' in smoke_script


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
