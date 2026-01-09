from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.websockets import WebSocketDisconnect

from .ws import WSManager
from .state import AppState
from glm50c.ble_stream import GLMStream

# --- Paths robustes (indépendants du cwd) ---
BASE_DIR = Path(__file__).resolve().parent  # .../src/planui
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI()

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

ws_mgr = WSManager()
state = AppState()
glm = GLMStream()

_ble_task: asyncio.Task | None = None
_status_task: asyncio.Task | None = None


async def broadcast_ble_status() -> None:
    await ws_mgr.broadcast_json({
        "type": "ble_status",
        "connected": glm.connected,
        "device_name": glm.device_name,
        "device_address": glm.device_address,
        "last_seen_ts": glm.last_seen_ts,
    })


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {
        "ble_connected": glm.connected,
        "device_name": glm.device_name,
        "device_address": glm.device_address,
        "last_seen_ts": glm.last_seen_ts,
        "last_measure_m": state.last_measure.value_m if state.last_measure else None,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws_mgr.connect(ws)
    try:
        # Statut BLE tout de suite
        await ws.send_json({
            "type": "ble_status",
            "connected": glm.connected,
            "device_name": glm.device_name,
            "device_address": glm.device_address,
            "last_seen_ts": glm.last_seen_ts,
        })

        # Dernière mesure si disponible
        if state.last_measure:
            await ws.send_json({
                "type": "measure",
                "value_m": state.last_measure.value_m,
                "ts": state.last_measure.ts,
            })

        while True:
            # On attend des messages (même si on ne s'en sert pas encore).
            # Si le client se déconnecte, WebSocketDisconnect sera levée.
            await ws.receive_text()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS] error: {e}", flush=True)
    finally:
        await ws_mgr.disconnect(ws)


@app.on_event("startup")
async def on_startup():
    global _ble_task, _status_task
    loop = asyncio.get_running_loop()

    async def status_tick():
        while True:
            await broadcast_ble_status()
            await asyncio.sleep(2)

    def on_measure(value_m: float):
        m = state.push_measure(value_m)
        asyncio.run_coroutine_threadsafe(
            ws_mgr.broadcast_json({"type": "measure", "value_m": m.value_m, "ts": m.ts}),
            loop
        )
        asyncio.run_coroutine_threadsafe(broadcast_ble_status(), loop)
