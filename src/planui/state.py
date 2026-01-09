from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
import time

@dataclass
class Measure:
    ts: float
    value_m: float

@dataclass
class AppState:
    last_measure: Optional[Measure] = None
    measures: List[Measure] = field(default_factory=list)

    def push_measure(self, value_m: float) -> Measure:
        m = Measure(ts=time.time(), value_m=float(value_m))
        self.last_measure = m
        self.measures.append(m)
        return m
