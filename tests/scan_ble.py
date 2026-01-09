# scan_ble.py
import asyncio
from bleak import BleakScanner

def fmt(d):
    name = d.name or ""
    return f"name={name!r} address={d.address} rssi={getattr(d,'rssi',None)}"

async def main():
    devices = await BleakScanner.discover(timeout=10.0)
    print(f"Found {len(devices)} BLE devices\n")
    for d in devices:
        print(fmt(d))

    print("\nNote: un iPhone n'apparaît pas forcément en BLE scan (il n'annonce pas toujours).")

if __name__ == "__main__":
    asyncio.run(main())
