import asyncio
import struct
import time
from bleak import BleakClient

ADDR = "00:13:43:BD:74:E6"
CHAR_UUID = "00004301-0000-0041-5253-534f46540000"
TIMEOUT = 30.0

# Commande "AutoSyncEnable" (mesures envoyées automatiquement)
AUTOSYNC_ENABLE = bytes([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A])

def hexdump(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)

def try_parse_measurement(payload: bytes):
    """
    D'après des implémentations qui marchent, la mesure (float32 LE)
    est souvent aux octets 7..10 inclus. On ne force pas si la trame
    est trop courte.
    """
    if len(payload) >= 11:
        raw = payload[7:11]
        value = struct.unpack("<f", raw)[0]
        return value
    return None

async def main():
    print(f"Connecting to GLM {ADDR} ...", flush=True)
    async with BleakClient(ADDR, timeout=TIMEOUT) as client:
        print("Connected:", client.is_connected, flush=True)

        # Découverte services (utile sur Windows)
        # Ensure services are resolved
        services = client.services
        _ = services

        log_path = f"logs/glm_{int(time.time())}.log"
        print("Log:", log_path, flush=True)

        def on_indicate(sender, data: bytearray):
            payload = bytes(data)
            m = try_parse_measurement(payload)
            line = f"[INDICATE] len={len(payload)} hex={hexdump(payload)}"
            if m is not None:
                line += f"  measurement_float32_le@7={m}"
            print(line, flush=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")

        print("Subscribing (indicate)...", flush=True)
        await client.start_notify(CHAR_UUID, on_indicate)

        print("Enabling AutoSync (write c0 55 02 01 00 1a)...", flush=True)
        # response=True => write request (plus fiable que write sans réponse)
        await client.write_gatt_char(CHAR_UUID, AUTOSYNC_ENABLE, response=True)

        print("\nOK. Fais une mesure sur le GLM.", flush=True)
        print("Sur certains modèles, il faut aussi appuyer sur Bluetooth/Send.", flush=True)
        print("Ctrl+C pour arrêter.\n", flush=True)

        try:
            while True:
                await asyncio.sleep(1)
        finally:
            try:
                await client.stop_notify(CHAR_UUID)
            except Exception:
                pass

if __name__ == "__main__":
    asyncio.run(main())
