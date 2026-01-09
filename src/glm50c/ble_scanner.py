from bleak import BleakScanner
from bleak.backends.device import BLEDevice

async def find_glm(timeout: float = 10.0) -> BLEDevice:
    devices = await BleakScanner.discover(timeout=timeout)
    for d in devices:
        if d.name and "GLM" in d.name.upper():
            return d
    raise RuntimeError("GLM non trouvé")
