from bleak import BleakClient

GLM_MEASURE_CHAR = "00004301-0000-0041-5253-534F46540000"

class GLMClient:
    def __init__(self, address: str):
        self.address = address
        self.client = BleakClient(address)

    async def connect(self):
        await self.client.connect()
        if not self.client.is_connected:
            raise RuntimeError("Connexion BLE échouée")

    async def disconnect(self):
        await self.client.disconnect()

    async def subscribe(self, callback):
        await self.client.start_notify(GLM_MEASURE_CHAR, callback)

    async def unsubscribe(self):
        await self.client.stop_notify(GLM_MEASURE_CHAR)
