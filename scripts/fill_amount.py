#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
최종 결론 - "얼마를 넣으면 이득인가"
=====================================
'어디서 넣을지'(route_gain.py)가 끝난 뒤 마지막에 답하는 질문.

인수인계서 4-D장의 구현체. 표준 라이브러리만 사용.

세 가지 입력이 합쳐진다
  1) 국면       - 우리 1년 데이터 (market_phase)
  2) 제도 잔여한도 - 사용자가 등록한 경우만 (경차 30만원/년, 화물 월 리터한도)
  3) 탱크 여유   - 차급 기본값

2026-09-21 실측으로 확정된 규칙
  * 상승장 '가득'  = 기대 +420원, 성공률 75%, 하위25%도 +20원  -> 쓴다
  * 하락장 '반만'  = 기대 +32원인데 재방문 비용 500~1,000원    -> 폐기
  * 그래서 기본 권장은 '가득'이고, 예외는 제도 한도뿐이다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import os
import sqlite3
from dataclasses import dataclass
from datetime import date
from typing import Optional

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oil.db")

# ── 차급별 기본값 ──────────────────────────────────────────────────────────
# (탱크 용량 L, 연비 km/L, 1회 평소 주유량 L)
VEHICLE = {
    "경차":      (35.0, 16.0, 25.0),
    "일반":      (60.0, 12.0, 30.0),
    "대형SUV":   (80.0,  8.0, 60.0),
    "1톤화물":   (60.0,  9.0, 50.0),
    "중형화물": (400.0,  6.0, 200.0),
    "대형화물": (800.0,  4.0, 400.0),
}

# 경고등이 켜졌을 때 남은 연료 비율(대략). 정확히 알 수 없으므로 보수적으로 잡는다.
LOW_FUEL_RATIO = 0.15

# ── 실측 상수 (2026-09-21) ────────────────────────────────────────────────
RISE_GAIN_PER_L = 21.0   # 상승 국면 7일 후 평균 상승폭(원/L). 승률 75%
FALL_GAIN_PER_L = 2.1    # 하락 국면 7일 후 평균 하락폭 - 너무 작아 조언하지 않는다
REVISIT_COST = 500.0     # 주유소를 한 번 더 가는 비용(원). 하락장 조언을 버리는 근거

# ── 제도 ───────────────────────────────────────────────────────────────────
# 경차 유류세 환급: 휘발유/경유 250원/L, 연 30만원, 2026-12-31 일몰
LIGHT_CAR_RATE = 250.0
LIGHT_CAR_CAP_WON = 300_000.0

# 제도 달력 - 이 날짜가 가까우면 '지금 가득'이 강해진다
CALENDAR = [
    (date(2026, 11, 30), "유류세 인하 종료", 112.0, "전 차종"),
    (date(2026, 12, 31), "경차 환급 일몰",   250.0, "경차"),
]
EVENT_WARN_DAYS = 14   # 이 안쪽이면 경고


@dataclass
class FillAdvice:
    liters: float              # 권장 주유량 (L)
    headline: str              # 한 줄 결론
    reason: str                # 왜 그런지
    extra_gain: float          # 평소대로 넣는 것 대비 추가 이득(원)
    cap_note: Optional[str]    # 제도 한도 안내
    strong: bool               # 강조해서 말할 것인가


def today_phase(con, as_of: Optional[str] = None) -> str:
    """오늘의 국면. market_phase 테이블에서 최신값."""
    if as_of:
        r = con.execute("SELECT phase FROM market_phase WHERE price_date<=? "
                        "ORDER BY price_date DESC LIMIT 1", (as_of,)).fetchone()
    else:
        r = con.execute("SELECT phase FROM market_phase "
                        "ORDER BY price_date DESC LIMIT 1").fetchone()
    return r[0] if r else "횡보"


def upcoming_event(as_of: date):
    """EVENT_WARN_DAYS 안에 닥친 제도 변화가 있으면 (이름, 원/L, 남은일수, 대상)."""
    best = None
    for d, name, won, target in CALENDAR:
        left = (d - as_of).days
        if 0 <= left <= EVENT_WARN_DAYS and (best is None or left < best[2]):
            best = (name, won, left, target)
    return best


def light_car_remaining_liters(used_won: float) -> float:
    """경차 환급 잔여 한도를 리터로 환산."""
    return max(0.0, (LIGHT_CAR_CAP_WON - used_won) / LIGHT_CAR_RATE)


def recommend(vehicle: str = "일반",
              phase: str = "횡보",
              current_ratio: float = LOW_FUEL_RATIO,
              subsidy_remaining_l: Optional[float] = None,
              event=None) -> FillAdvice:
    """
    얼마를 넣으면 이득인가.

    vehicle             차급 키 (VEHICLE)
    phase               '상승' / '하락' / '횡보'
    current_ratio       현재 잔량 비율 (경고등이면 0.15)
    subsidy_remaining_l 제도 잔여 한도(리터). None이면 제도 없음/미등록
    event               upcoming_event() 결과
    """
    tank, kmpl, usual = VEHICLE.get(vehicle, VEHICLE["일반"])
    room = round(tank * (1.0 - current_ratio))       # 가득 채우려면 넣을 양
    usual = min(usual, room)

    # --- 1순위: 제도 한도가 채울 양보다 적다 ---
    if subsidy_remaining_l is not None and subsidy_remaining_l < room:
        if subsidy_remaining_l <= 0:
            return FillAdvice(
                liters=room,
                headline=f"{room:.0f}L, 가득 채우세요",
                reason="올해 환급 한도를 다 쓰셨습니다. 일반 가격으로 계산했습니다.",
                extra_gain=0.0,
                cap_note="환급 한도 소진 - 내년 1월에 초기화됩니다",
                strong=False)
        return FillAdvice(
            liters=round(subsidy_remaining_l),
            headline=f"{subsidy_remaining_l:.0f}L만 넣으세요",
            reason=f"여기까지가 환급 대상입니다. 더 넣으면 초과분은 "
                   f"리터당 {LIGHT_CAR_RATE:.0f}원을 그냥 냅니다.",
            extra_gain=0.0,
            cap_note=f"환급 잔여 {subsidy_remaining_l:.0f}L "
                     f"({subsidy_remaining_l * LIGHT_CAR_RATE:,.0f}원)",
            strong=True)

    # --- 2순위: 제도 변화가 코앞이다 (전 차종) ---
    if event:
        name, won, left, target = event
        gain = (room - usual) * won
        return FillAdvice(
            liters=room,
            headline=f"{room:.0f}L, 가득 채우세요",
            reason=f"{left}일 뒤 {name}. 리터당 {won:.0f}원이 한 번에 오릅니다.",
            extra_gain=gain,
            cap_note=None,
            strong=True)

    # --- 3순위: 상승 국면 ---
    if phase == "상승":
        gain = (room - usual) * RISE_GAIN_PER_L
        return FillAdvice(
            liters=room,
            headline=f"{room:.0f}L, 가득 채우세요",
            reason=f"지금 오르는 장입니다. 일주일 미루면 리터당 "
                   f"{RISE_GAIN_PER_L:.0f}원 더 냅니다 (10번 중 7~8번).",
            extra_gain=gain,
            cap_note=None,
            strong=True)

    # --- 그 외: 하락·횡보 ---
    # 하락장 '반만 넣기'는 폐기. 기대 +32원인데 재방문 비용이 500원 이상이다.
    return FillAdvice(
        liters=room,
        headline=f"{room:.0f}L, 가득 채우세요",
        reason="가격이 크게 움직이지 않는 구간입니다. 주유 횟수를 줄이는 쪽이 낫습니다.",
        extra_gain=0.0,
        cap_note=None,
        strong=False)


# ── 시연 ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    con = sqlite3.connect(DB)
    ph = today_phase(con)
    tdy = date(2026, 9, 21)
    ev = upcoming_event(tdy)
    print("=" * 76)
    print(f"  얼마를 넣으면 이득인가 - 오늘 국면: {ph}"
          f"{' · 임박 이벤트: ' + ev[0] if ev else ' · 임박 이벤트 없음'}")
    print("=" * 76)

    cases = [
        ("일반 승용차 · 횡보",        "일반",  "횡보", None),
        ("일반 승용차 · 상승장",      "일반",  "상승", None),
        ("경차 · 상승장 · 한도 넉넉",  "경차",  "상승", 300.0),
        ("경차 · 한도 잔여 15L",      "경차",  "상승", 15.0),
        ("경차 · 한도 소진",          "경차",  "상승", 0.0),
        ("중형화물 · 상승장",         "중형화물", "상승", None),
    ]
    for label, veh, phase, sub in cases:
        a = recommend(veh, phase, subsidy_remaining_l=sub)
        mark = "★" if a.strong else " "
        print(f"\n  {mark} [{label}]")
        print(f"      {a.headline}")
        print(f"      {a.reason}")
        if a.extra_gain > 0:
            print(f"      평소대로 넣는 것보다 {a.extra_gain:,.0f}원 이득")
        if a.cap_note:
            print(f"      · {a.cap_note}")

    print("\n" + "=" * 76)
    print("  제도 달력")
    print("=" * 76)
    for d, name, won, target in CALENDAR:
        print(f"  D-{(d - tdy).days:<4} {d}  {name:<16} 리터당 {won:>5.0f}원 · {target}")
    con.close()
