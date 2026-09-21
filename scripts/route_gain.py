#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1순위 기능 - "가는 길에서 진짜 이득인 곳"
===========================================
표준 라이브러리만 사용. 좌표가 없어도 계산부·판단부는 전부 동작하며,
경로 산출만 RouteProvider 로 분리해 두었습니다.

핵심 원칙 (인수인계서 4장)
  * 비용은 왕복이 아니라 **우회(detour)** 다.
  * 출력은 목록이 아니라 **한 곳 + 이유 한 줄**.
  * 돌아갈 가치가 없으면 **말린다**.

용어
  기준가(baseline)  : 돌아가지 않았을 때 넣게 될 가격.
                      경로상에서 그냥 만나는 주유소 = 동네 중앙값으로 근사한다.
  우회거리(detour)  : (출발→주유소→목적지) - (출발→목적지)
  순이득(net gain)  : (기준가 - 이 집 가격) × 주유량 - 우회거리 × (기름값 ÷ 연비)
"""


from __future__ import annotations

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import math
import os
import sqlite3
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oil.db")

# ── 기본 가정 ──────────────────────────────────────────────────────────────
DEFAULT_LITERS = 30.0       # 1회 주유량
DEFAULT_KMPL = 12.0         # 연비 km/L
DEFAULT_SPEED_KMH = 30.0    # 시내 평균 속도 (거리→분 환산용)

# 2단계 후보 선별
# CORRIDOR_KM: 2026-09-21 실측으로 4.0 확정.
#   2km 217원 / 3km 246원 / 4km 257원 / 5km 258원 / 6km 252원 (평균 순이득)
#   4km가 꺾이는 지점 - 5km는 +0.4%p뿐이고 6km는 오히려 떨어진다.
CORRIDOR_KM = 4.0           # 경로 직선에서 수직거리 이 이내만 1차 통과
TOP_N_ROUTE = 5             # 순이득을 계산할 상위 후보 수 (가격 싼 순)

# 선택적 경로 검증 - 추천이 이보다 멀리 벗어나면 그때만 실제 경로 API로 확인한다.
# 직선 근사가 위험한 경우(강/산/고속도로 진출입)를 잡는다.
# 발동률 11.7% -> 무료 한도(5,000/일)로 일 4.3만 검색까지 0원.
VERIFY_PERP_KM = 1.5

# "말릴" 기준 - 이보다 적게 남으면 돌아갈 가치가 없다고 본다
MIN_WORTH_WON = 500.0


# ── 순이득 계산 ────────────────────────────────────────────────────────────
def detour_cost_per_km(fuel_price: float, kmpl: float = DEFAULT_KMPL) -> float:
    """우회 1km당 연료비(원). 왕복이 아니라 편도 우회분만 센다."""
    return fuel_price / kmpl


def net_gain(price_here: float, price_baseline: float, detour_km: float,
             liters: float = DEFAULT_LITERS, kmpl: float = DEFAULT_KMPL,
             fuel_price: Optional[float] = None) -> float:
    """이 주유소로 우회했을 때의 순이득(원). 음수면 손해."""
    fp = fuel_price if fuel_price is not None else price_baseline
    saved = (price_baseline - price_here) * liters
    cost = detour_km * detour_cost_per_km(fp, kmpl)
    return saved - cost


def breakeven_detour_km(price_gap: float, liters: float = DEFAULT_LITERS,
                        kmpl: float = DEFAULT_KMPL,
                        fuel_price: float = 1855.0) -> float:
    """
    리터당 price_gap 원 싼 곳이라면, 몇 km까지 우회해도 본전인가.
    price_gap 이 0 이하면 0.
    """
    if price_gap <= 0:
        return 0.0
    return (price_gap * liters) / detour_cost_per_km(fuel_price, kmpl)


def km_to_minutes(km: float, speed_kmh: float = DEFAULT_SPEED_KMH) -> float:
    """사람은 km보다 분을 잘 체감한다 (UI 원칙 6장)."""
    return km / speed_kmh * 60.0


# ── 지오메트리 (좌표만 있으면 무료) ─────────────────────────────────────────
_R = 6371.0088  # 지구 반경 km


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _R * math.asin(math.sqrt(h))


def _to_xy(p: Tuple[float, float], lat0: float) -> Tuple[float, float]:
    """등거리 원통 근사. 한국 정도 범위에서 수백 m 오차면 충분하다."""
    k = math.cos(math.radians(lat0))
    return (math.radians(p[1]) * _R * k, math.radians(p[0]) * _R)


def perpendicular_km(point: Tuple[float, float],
                     seg_a: Tuple[float, float],
                     seg_b: Tuple[float, float]) -> float:
    """점에서 선분(출발→목적지)까지의 수직거리 km. 1차 필터용."""
    lat0 = (seg_a[0] + seg_b[0]) / 2
    px, py = _to_xy(point, lat0)
    ax, ay = _to_xy(seg_a, lat0)
    bx, by = _to_xy(seg_b, lat0)
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy
    if L2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)


# ── 경로 제공자 ────────────────────────────────────────────────────────────
class RouteProvider:
    """detour_km(origin, station, dest) -> (우회거리 km, 우회시간 분 또는 None)"""

    def detour(self, origin, station, dest):
        raise NotImplementedError


class StraightLineRoute(RouteProvider):
    """
    좌표만으로 계산하는 무료 폴백. 실도로보다 짧게 나오므로
    road_factor 로 보정한다 (한국 시내 실측 경험칙 1.3 내외).
    """

    def __init__(self, road_factor: float = 1.3, speed_kmh: float = DEFAULT_SPEED_KMH):
        self.f = road_factor
        self.speed = speed_kmh

    def detour(self, origin, station, dest):
        direct = haversine_km(origin, dest)
        via = haversine_km(origin, station) + haversine_km(station, dest)
        d = max(0.0, (via - direct)) * self.f
        return d, km_to_minutes(d, self.speed)


class KakaoRoute(RouteProvider):
    """
    카카오모빌리티 길찾기 API 어댑터.
    이 컨테이너에서는 외부 접속이 막혀 있어 호출되지 않는다 - 사용자 PC/서버에서만 동작.
    waypoint 로 주유소를 경유지에 넣고, 경유 없는 경로와의 차이를 우회로 본다.
    호출 수를 줄이려고 origin→dest 직행 경로는 한 번만 구해 캐시한다.
    """

    BASE = "https://apis-navi.kakaomobility.com/v1/waypoints/directions"

    def __init__(self, rest_key: str):
        self.key = rest_key
        self._direct_cache = {}

    def _post(self, payload):
        import json
        import urllib.request
        req = urllib.request.Request(
            self.BASE,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "KakaoAK " + self.key,
                     "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))

    @staticmethod
    def _pt(p):
        return {"x": p[1], "y": p[0]}   # x=경도, y=위도

    def _summary(self, js):
        rt = js["routes"][0]
        s = rt["summary"]
        return s["distance"] / 1000.0, s["duration"] / 60.0

    def detour(self, origin, station, dest):
        k = (origin, dest)
        if k not in self._direct_cache:
            js = self._post({"origin": self._pt(origin), "destination": self._pt(dest)})
            self._direct_cache[k] = self._summary(js)
        d0, t0 = self._direct_cache[k]
        js = self._post({"origin": self._pt(origin), "destination": self._pt(dest),
                         "waypoints": [self._pt(station)]})
        d1, t1 = self._summary(js)
        return max(0.0, d1 - d0), max(0.0, t1 - t0)


# ── 후보와 결과 ────────────────────────────────────────────────────────────
@dataclass
class Candidate:
    station_id: str
    name: str
    brand: str
    region: str
    price: float
    lat: float
    lng: float
    perp_km: float = 0.0
    detour_km: Optional[float] = None
    detour_min: Optional[float] = None
    gain: Optional[float] = None


@dataclass
class Decision:
    verdict: str            # 'detour' | 'stay' | 'flat' | 'no_candidate'
    headline: str
    reason: str
    pick: Optional[Candidate]
    baseline_price: float
    liters: float
    runner_up: Optional[Candidate] = None


# ── 핵심 로직 ──────────────────────────────────────────────────────────────
def corridor_filter(cands: Sequence[Candidate], origin, dest,
                    max_perp_km: float = CORRIDOR_KM) -> List[Candidate]:
    """1차 필터 - 경로 직선에서 수직거리 이내. 좌표만 쓰므로 API 비용 0."""
    out = []
    for c in cands:
        c.perp_km = perpendicular_km((c.lat, c.lng), origin, dest)
        if c.perp_km <= max_perp_km:
            out.append(c)
    return out


def decide(cands: Sequence[Candidate], origin, dest, baseline_price: float,
           provider: RouteProvider, liters: float = DEFAULT_LITERS,
           kmpl: float = DEFAULT_KMPL, top_n: int = TOP_N_ROUTE,
           min_worth: float = MIN_WORTH_WON) -> Decision:
    """
    2단계 선별 후 한 곳만 고른다.
      1) 회랑 필터 (무료)
      2) 가격 싼 순 top_n 만 실제 경로 조회
      3) 순이득 최대 1곳. 그래도 min_worth 미만이면 '그냥 넣으세요'
    """
    inside = corridor_filter(cands, origin, dest)
    if not inside:
        return Decision("no_candidate", "가는 길에 주유소가 없습니다.",
                        "경로에서 3km 이내에 주유소를 못 찾았습니다.",
                        None, baseline_price, liters)

    # 동네가 평탄하면 애초에 비교가 무의미 (2순위 가드와 같은 철학)
    prices = sorted(c.price for c in inside)
    if prices[-1] - prices[0] < 15:
        near = min(inside, key=lambda c: c.perp_km)
        return Decision("flat", f"가는 길 {near.name}에서 그냥 넣으세요.",
                        "이 경로의 주유소들은 가격이 거의 같습니다.",
                        near, baseline_price, liters)

    probe = sorted(inside, key=lambda c: c.price)[:top_n]
    for c in probe:
        c.detour_km, c.detour_min = provider.detour(origin, (c.lat, c.lng), dest)
        c.gain = net_gain(c.price, baseline_price, c.detour_km, liters, kmpl)

    probe.sort(key=lambda c: c.gain, reverse=True)
    best = probe[0]
    second = probe[1] if len(probe) > 1 else None

    if best.gain is None or best.gain < min_worth:
        onroute = min(inside, key=lambda c: c.perp_km)
        cheapest = probe[0]
        return Decision(
            "stay", f"가는 길의 {onroute.name}에서 그냥 넣으세요.",
            f"더 싼 곳까지 {cheapest.detour_km:.1f}km 돌아가면 "
            f"{max(0, cheapest.gain or 0):,.0f}원 남습니다. 의미 없어요.",
            onroute, baseline_price, liters, runner_up=cheapest)

    mins = best.detour_min if best.detour_min is not None else km_to_minutes(best.detour_km)
    return Decision(
        "detour",
        f"{best.name} · {best.price:,.0f}원",
        f"{mins:.0f}분 돌아서 {best.gain:,.0f}원 아낍니다 "
        f"(가는 길에서 {best.detour_km:.1f}km 벗어남 · {liters:.0f}L 기준)",
        best, baseline_price, liters, runner_up=second)


# ── DB 연동 ────────────────────────────────────────────────────────────────
FUEL_COL = {"휘발유": "gasoline", "경유": "diesel",
            "고급휘발유": "premium_gasoline", "실내등유": "kerosene"}


def load_candidates(con, region: str, fuel: str = "휘발유",
                    price_date: str = "2026-09-20") -> List[Candidate]:
    """해당 시군구의 좌표 있는 주유소를 후보로 읽는다."""
    col = FUEL_COL[fuel]
    rows = con.execute(f"""
        SELECT s.station_id, s.name, s.brand, s.region, p.{col}, s.lat, s.lng
        FROM stations s JOIN prices p
          ON p.station_id = s.station_id AND p.price_date = ?
        WHERE s.region = ? AND p.{col} IS NOT NULL
          AND s.lat IS NOT NULL AND s.lng IS NOT NULL
    """, (price_date, region)).fetchall()
    return [Candidate(*r) for r in rows]


def baseline_for(con, region: str, fuel: str = "휘발유",
                 price_date: str = "2026-09-20") -> Optional[float]:
    """기준가 = 동네 중앙값. 돌아가지 않으면 대략 이 값을 내게 된다."""
    col = FUEL_COL[fuel]
    vals = [r[0] for r in con.execute(f"""
        SELECT p.{col} FROM stations s JOIN prices p
          ON p.station_id = s.station_id AND p.price_date = ?
        WHERE s.region = ? AND p.{col} IS NOT NULL ORDER BY p.{col}
    """, (price_date, region))]
    if not vals:
        return None
    m = len(vals)
    return vals[m // 2] if m % 2 else (vals[m // 2 - 1] + vals[m // 2]) / 2
