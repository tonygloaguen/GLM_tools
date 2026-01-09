import asyncio
import sys
import traceback

from glm50c.ble_scanner import find_glm
from glm50c.ble_client import GLMClient
from glm50c.protocol import parse_glm_measure as decode_payload

def on_measure(sender, data: bytearray):
    decoded = decode_payload(bytes(data))
    print(f"[MEASURE] sender={sender} decoded={decoded}", flush=True)


async def run():
    print("[BOOT] start run()", flush=True)

    device = await find_glm()
    print(f"[GLM] trouvé: name={device.name} addr={device.address}", flush=True)

    client = GLMClient(device.address)
    await client.connect()
    print("[BLE] connecté. En attente des mesures...", flush=True)

    await client.subscribe(on_measure)

    try:
        while True:
            await asyncio.sleep(1)
    finally:
        print("[BLE] cleanup...", flush=True)
        try:
            await client.unsubscribe()
        except Exception:
            pass
        await client.disconnect()


def main():
    print("[BOOT] main()", flush=True)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("[STOP] Ctrl+C", flush=True)
    except Exception:
        print("[ERROR] exception non gérée:", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
