import asyncio
from bleak import BleakScanner

async def main():
    print("Scanning 15s...")
    devices = await BleakScanner.discover(timeout=15.0)
    print(f"Found {len(devices)} devices\n")
    for d in devices:
        name = d.name or ""
        print(f"name={name!r} address={d.address} rssi={getattr(d,'rssi',None)}")

if __name__ == "__main__":
    asyncio.run(main())
