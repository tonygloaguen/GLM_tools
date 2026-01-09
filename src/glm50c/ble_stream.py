from __future__ import annotations

import asyncio
import time
from typing import Callable, Optional

from bleak import BleakClient

from .ble_scanner import find_glm
from .protocol import parse_glm_measure

CHAR_UUID = "00004301-0000-0041-5253-534f46540000"
AUTOSYNC_ENABLE = bytes([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A])


class GLMStream:
    """
    Stream BLE GLM50C -> callback(on_measure_m)
    - Maintient un état connected
    - Reconnecte automatiquement en cas de perte
    """

    def __init__(self, *, scan_timeout: float = 12.0, connect_timeout: float = 30.0) -> None:
        self._stop = asyncio.Event()
        self.scan_timeout = scan_timeout
        self.connect_timeout = connect_timeout

        self.connected: bool = False
        self.device_name: Optional[str] = None
        self.device_address: Optional[str] = None
        self.last_seen_ts: Optional[float] = None

        self._client: Optional[BleakClient] = None

    def stop(self) -> None:
        self._stop.set()

    async def _connect_once(self, on_measure: Callable[[float], None]) -> None:
        dev = await find_glm(timeout=self.scan_timeout)

        self.device_name = dev.name
        self.device_address = dev.address

        client = BleakClient(dev, timeout=self.connect_timeout)
        self._client = client

        await client.connect()
        if not client.is_connected:
            raise RuntimeError("BLE connect failed")

        self.connected = True
        self.last_seen_ts = time.time()
        print(f"[GLM] connected name={self.device_name!r} addr={self.device_address}", flush=True)

        # Important: sous Windows, le cache services peut être vide tant qu'on ne force pas
        # _ = client.services or await client.get_services()

        def cb(_sender, data: bytearray):
            payload = bytes(data)

            # 1) brut
            print(f"[GLM RX] len={len(payload)} hex={payload.hex(' ')}", flush=True)

            # 2) décodage mètres (si trame mesure)
            value_m = parse_glm_measure(payload)
            if value_m is not None:
                self.last_seen_ts = time.time()
                print(f"[GLM MEASURE] {value_m:.4f} m", flush=True)
                try:
                    on_measure(float(value_m))
                except Exception as e:
                    print(f"[GLM] on_measure callback error: {e}", flush=True)

        await client.start_notify(CHAR_UUID, cb)

        # Active l'envoi auto
        await client.write_gatt_char(CHAR_UUID, AUTOSYNC_ENABLE, response=True)

        # On reste connecté jusqu'au stop ou jusqu'à ce que Bleak lève
        await self._stop.wait()

        # Cleanup
        try:
            await client.stop_notify(CHAR_UUID)
        except Exception:
            pass
        try:
            await client.disconnect()
        except Exception:
            pass

    async def run(self, on_measure: Callable[[float], None]) -> None:
        """
        Boucle de streaming avec reconnexion.
        """
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._connect_once(on_measure)
                # Si on sort normalement (stop), on quitte.
                break
            except asyncio.CancelledError:
                break
            except Exception as e:
                # Déconnexion/échec -> repasser en disconnected et retenter
                if self.connected:
                    print("[GLM] disconnected", flush=True)
                self.connected = False
                self._client = None

                print(f"[GLM] error: {e} (retry in {backoff:.1f}s)", flush=True)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 1.7, 10.0)

        self.connected = False
        print("[GLM] stream stopped", flush=True)
