from __future__ import annotations
import struct
from typing import Optional

def parse_glm_measure(payload: bytes) -> Optional[float]:
    # Tes logs: C0 55 10 06 ... float32 LE @ offset 7
    if len(payload) < 11:
        return None
    if not (payload[0] == 0xC0 and payload[1] == 0x55 and payload[2] == 0x10):
        return None
    if payload[3] != 0x06:
        return None
    return float(struct.unpack("<f", payload[7:11])[0])
