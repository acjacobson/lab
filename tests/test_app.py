import re
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


def test_homepage_includes_arcade_project_card():
    response = client.get("/")
    assert response.status_code == 200
    assert 'href="/games/arcade/"' in response.text
    assert "Classic Arcade" in response.text
    assert "Four timeless games in one cabinet" in response.text


def test_arcade_route_renders_a_vintage_cabinet_and_four_game_selector_options():
    response = client.get("/games/arcade/")
    assert response.status_code == 200
    html = response.text

    assert '<main class="arcade-cabinet">' in html
    assert '<header class="arcade-marquee"' in html
    assert '<section class="arcade-bezel"' in html
    assert '<canvas id="game-canvas"' in html
    assert '<section id="game-selector"' in html

    choices = re.findall(r'<button[^>]+class="game-choice"[^>]*>', html)
    assert len(choices) == 4
    for title in ("Block Drop", "Brick Breaker", "Alien Blaster", "Maze Muncher"):
        assert title in html

    assert '<link rel="stylesheet" href="/static/games/arcade/styles.css">' in html
    assert '<script type="module" src="/static/games/arcade/game.js"></script>' in html


def test_arcade_route_has_accessible_control_panel_actions_and_responsive_styles():
    response = client.get("/games/arcade/")
    assert response.status_code == 200
    html = response.text

    assert '<section class="control-panel" aria-label="Arcade controls">' in html
    assert 'class="joystick"' in html
    assert 'aria-label="Directional controls"' in html
    assert 'id="primary-action"' in html
    assert 'id="restart-game"' in html
    assert 'id="selector-home"' in html
    assert 'id="sound-toggle"' in html

    stylesheet = client.get("/static/games/arcade/styles.css")
    assert stylesheet.status_code == 200
    assert ".arcade-cabinet" in stylesheet.text
    assert ".arcade-marquee" in stylesheet.text
    assert ".arcade-bezel" in stylesheet.text
    assert ".control-panel" in stylesheet.text
    assert "min-height: 44px" in stylesheet.text
    assert "@media (max-width: 700px)" in stylesheet.text


def test_arcade_selector_keeps_all_four_games_reachable_on_small_phones():
    response = client.get("/games/arcade/")
    assert response.status_code == 200
    html = response.text
    choices = re.findall(r'<button[^>]+class="game-choice"[^>]*>', html)

    assert [
        game_id
        for choice in choices
        for game_id in re.findall(r'data-game="([^"]+)"', choice)
    ] == [
        "block-drop",
        "brick-breaker",
        "alien-blaster",
        "maze-muncher",
    ]
    assert 'class="game-choice-list" role="group"' in html

    stylesheet = client.get("/static/games/arcade/styles.css").text
    phone_styles = stylesheet[stylesheet.index("@media (max-width: 430px)"):]
    assert "grid-template-columns: repeat(2, minmax(0, 1fr));" in phone_styles
    assert "min-height: 44px" in phone_styles
    assert "overflow-y: auto" in stylesheet


def test_arcade_runtime_hooks_have_one_polite_status_each():
    response = client.get("/games/arcade/")
    assert response.status_code == 200
    html = response.text

    for element_id in ("screen-message", "credit-display", "high-score"):
        element = re.search(
            rf"<[a-z]+[^>]+id=\"{element_id}\"[^>]*>",
            html,
        )
        assert element, f"missing runtime hook: {element_id}"
        attributes = element.group(0)
        assert 'role="status"' in attributes
        assert 'aria-live="polite"' in attributes
        assert 'aria-atomic="true"' in attributes

    assert 'class="arcade-bezel" aria-label="Arcade screen" aria-live' not in html
    assert html.count('role="status"') == 3


def test_arcade_game_choice_focus_indicator_is_distinct_from_selection_state():
    stylesheet = client.get("/static/games/arcade/styles.css").text
    focus_start = stylesheet.index(".game-choice:focus-visible")
    focus_end = stylesheet.index("}", focus_start)
    focus_rule = stylesheet[focus_start:focus_end]

    assert "outline: 3px solid var(--cyan)" in focus_rule
    assert "outline-offset: 2px" in focus_rule
    assert "outline: none" not in focus_rule


def test_arcade_route_without_trailing_slash_redirects():
    response = client.get("/games/arcade", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert response.headers["location"] == "/games/arcade/"


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


def test_sailing_controls_are_in_a_dedicated_dock_after_the_map():
    response = client.get("/games/sailing/")
    frame_start = response.text.index('<section class="game-frame"')
    frame_end = response.text.index("</section>", frame_start)
    control_dock = response.text.index('<section class="control-dock"')

    assert frame_end < control_dock

    stylesheet = client.get("/static/games/sailing/styles.css").text
    assert ".control-dock" in stylesheet


def test_sailing_route_without_trailing_slash_redirects():
    response = client.get("/games/sailing", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert response.headers["location"] == "/games/sailing/"


def test_sailing_hud_and_trade_action_have_accessible_phone_hooks():
    response = client.get("/games/sailing/")
    assert response.status_code == 200
    assert '<section class="status-hud"' in response.text
    assert 'id="coins-value"' in response.text
    assert 'id="cargo-value"' in response.text
    assert 'id="current-port-value"' not in response.text
    assert '<button id="trade-button"' in response.text
    assert 'aria-controls="trade-dialog"' in response.text
    assert '>Trade<' in response.text

    stylesheet = client.get("/static/games/sailing/styles.css").text
    assert ".status-hud" in stylesheet
    assert ".trade-button" in stylesheet
    assert "min-height: 44px" in stylesheet


def test_sailing_trade_modal_locks_scroll_and_test_api_does_not_expose_mutable_game():
    stylesheet = client.get("/static/games/sailing/styles.css").text
    script = client.get("/static/games/sailing/game.js").text

    assert "html.trade-modal-open" in stylesheet
    assert "body.trade-modal-open" in stylesheet
    assert "lockBackgroundScroll();" in script
    assert "unlockBackgroundScroll();" in script
    assert "window.__SAILING_GAME__ = Object.freeze({" in script
    assert "\n  game," not in script


def test_sailing_trade_dialog_has_buy_sell_tabs_feedback_and_close():
    response = client.get("/games/sailing/")
    assert response.status_code == 200
    assert '<dialog id="trade-dialog"' in response.text
    assert 'aria-labelledby="trade-dialog-title"' in response.text
    assert 'id="trade-dialog-title"' in response.text
    assert 'id="trade-port-name"' in response.text
    assert 'id="buy-tab"' in response.text
    assert 'id="sell-tab"' in response.text
    assert 'id="buy-list"' in response.text
    assert 'id="sell-list"' in response.text
    assert 'id="trade-feedback"' in response.text
    assert 'id="close-trade"' in response.text
    assert 'aria-label="Close trade dialog"' in response.text


def test_sailing_trade_module_is_served_with_the_game_assets():
    trading = client.get("/static/games/sailing/trading.mjs")
    assert trading.status_code == 200
    assert "PORTS" in trading.text
    assert "buyItem" in trading.text
    assert "sellItem" in trading.text


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
