import asyncio
import time
import struct
from bleak import BleakClient

ADDR = "00:13:43:BD:74:E6"
CHAR_UUID = "00004301-0000-0041-5253-534f46540000"
TIMEOUT = 30.0

def hexdump(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)

def try_decode(b: bytes) -> dict:
    out = {"len": len(b), "hex": hexdump(b)}

    # ASCII printable?
    try:
        s = b.decode("ascii")
        if all(32 <= ord(c) <= 126 or c in "\r\n\t" for c in s):
            out["ascii"] = s
    except Exception:
        pass

    # Common numeric interpretations (little-endian)
    if len(b) >= 2:
        out["u16_le_first2"] = struct.unpack("<H", b[:2])[0]
        out["i16_le_first2"] = struct.unpack("<h", b[:2])[0]
    if len(b) >= 4:
        out["u32_le_first4"] = struct.unpack("<I", b[:4])[0]
        out["i32_le_first4"] = struct.unpack("<i", b[:4])[0]
        out["f32_le_first4"] = struct.unpack("<f", b[:4])[0]
    if len(b) >= 8:
        out["u64_le_first8"] = struct.unpack("<Q", b[:8])[0]
        out["f64_le_first8"] = struct.unpack("<d", b[:8])[0]

    return out

async def main():
    print(f"Connecting to GLM {ADDR} (timeout={TIMEOUT}s)...", flush=True)
    async with BleakClient(ADDR, timeout=TIMEOUT) as client:
        print("Connected:", client.is_connected, flush=True)

        # Services are automatically discovered upon connection
        _ = client.services

        log_path = f"logs/glm_capture_{int(time.time())}.log"
        print("Log:", log_path, flush=True)

        def on_indicate(sender, data: bytearray):
            payload = bytes(data)
            decoded = try_decode(payload)
            line = f"[INDICATE] sender={sender} {decoded}"
            print(line, flush=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")

        print(f"Subscribing to indications on {CHAR_UUID} ...", flush=True)
        await client.start_notify(CHAR_UUID, on_indicate)

        print("\nCapture en cours.", flush=True)
        print("1) Fais une mesure sur le GLM", flush=True)
        print("2) Si rien n'arrive, appuie sur le bouton Bluetooth/Send du GLM", flush=True)
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
