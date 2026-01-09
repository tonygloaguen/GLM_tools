from __future__ import annotations
import asyncio
from bleak import BleakScanner

GLM_NAME_HINTS = ("Bosch", "GLM", "GLM50C")

async def find_glm(timeout: float = 12.0):
    devices = await BleakScanner.discover(timeout=timeout)

    # Match par nom (ton cas)
    for d in devices:
        name = (d.name or "").strip()
        if any(h.lower() in name.lower() for h in GLM_NAME_HINTS):
            return d

    # Fallback: match par préfixe d'adresse connu (ton modèle actuel)
    for d in devices:
        if d.address.upper().startswith("00:13:43"):
            return d

    # Debug utile
    seen = [(d.name or "", d.address) for d in devices]
    raise RuntimeError(f"GLM non trouvé. Devices vus: {seen}")
