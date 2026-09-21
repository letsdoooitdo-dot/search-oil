#!/usr/bin/env python3
"""
2순위 기능 - "눈앞의 이 집, 넣어도 되나"
좌표 없이 시군구 + 오늘 가격 + 1년 성격만으로 판정한다.

출력은 두 줄:
  1) 숫자   - 동네 중앙값 대비 몇 원
  2) 성격   - 1년 내내 어느 자리였는지

인수인계서 4장 2순위 규칙을 그대로 구현.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import sqlite3
from dataclasses import dataclass, asdict
from typing import Optional

import os
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oil.db")

FUEL_COL = {"휘발유": "gasoline", "경유": "diesel",
            "고급휘발유": "premium_gasoline", "실내등유": "kerosene"}

# 동네 중앙값 대비 등급 경계 (원). 백분위를 쓰지 않는 이유: 동네 안 동점 비율 68%
GRADES = [(-10**9, -30, "아주 쌉니다", "very_cheap"),
          (-30,    -10, "싼 편입니다", "cheap"),
          (-10,     10, "평균 수준입니다", "average"),
          (10,      40, "비싼 편입니다", "pricey"),
          (40,   10**9, "많이 비쌉니다", "expensive")]

MIN_STATIONS = 10   # 이 미만이면 동네 판정 생략
FLAT_SPREAD = 15    # 중앙-최저가 이 미만이면 "어디나 같은 동네"

CHARACTER_LINE = {
    "늘 최저권": "이 집은 1년 내내 동네에서 싼 축이었어요.",
    "싼 편":     "이 집은 1년 평균으로도 싼 편이었어요.",
    "보통":      "이 집은 1년 내내 동네 평균 자리였어요.",
    "비싼 편":   "이 집은 1년 평균으로도 비싼 편이었어요.",
    "늘 최고권": "이 집은 1년 내내 동네에서 비싼 축이었어요.",
}


@dataclass
class Verdict:
    station_id: str
    name: str
    region: str
    fuel: str
    price: Optional[float]
    nb_median: Optional[float]
    nb_min: Optional[float]
    nb_count: int
    diff: Optional[float]
    grade: Optional[str]
    headline: str          # 1줄차
    character: Optional[str]
    subline: Optional[str]  # 2줄차
    judgeable: bool
    reason: Optional[str]   # 판정 불가 사유


def josa(word: str, pair: str = "은는") -> str:
    """받침 유무에 따라 조사를 고른다. pair 예: '은는','이가','을를'."""
    if not word:
        return pair[1]
    ch = word[-1]
    if "가" <= ch <= "힣":
        return pair[0] if (ord(ch) - 0xAC00) % 28 else pair[1]
    return pair[1]


def _grade(diff: float):
    for lo, hi, label, key in GRADES:
        if lo <= diff < hi:
            return label, key
    return GRADES[-1][2], GRADES[-1][3]


def judge(con, station_id: str, fuel: str = "휘발유",
          price_date: str = "2026-09-20") -> Verdict:
    col = FUEL_COL[fuel]

    row = con.execute(f"""
        SELECT s.station_id, s.name, s.region, p.{col}, c.character
        FROM stations s
        LEFT JOIN prices p
               ON p.station_id = s.station_id AND p.price_date = ?
        LEFT JOIN station_character c ON c.station_id = s.station_id
        WHERE s.station_id = ?
    """, (price_date, station_id)).fetchone()
    if row is None:
        raise KeyError(station_id)
    sid, name, region, price, character = row

    # 동네 통계 - 같은 시군구, 같은 연료, 값이 있는 곳만
    stat = con.execute(f"""
        SELECT COUNT(p.{col}), MIN(p.{col})
        FROM stations s JOIN prices p
          ON p.station_id = s.station_id AND p.price_date = ?
        WHERE s.region = ? AND p.{col} IS NOT NULL
    """, (price_date, region)).fetchone()
    n, nb_min = stat

    nb_median = None
    if n:
        vals = [r[0] for r in con.execute(f"""
            SELECT p.{col}
            FROM stations s JOIN prices p
              ON p.station_id = s.station_id AND p.price_date = ?
            WHERE s.region = ? AND p.{col} IS NOT NULL
            ORDER BY p.{col}
        """, (price_date, region))]
        m = len(vals)
        nb_median = vals[m // 2] if m % 2 else (vals[m // 2 - 1] + vals[m // 2]) / 2

    base = dict(station_id=sid, name=name, region=region, fuel=fuel, price=price,
                nb_median=nb_median, nb_min=nb_min, nb_count=n,
                character=character,
                subline=CHARACTER_LINE.get(character) if character else None)

    # --- 판정 불가 케이스 ---
    if price is None:
        return Verdict(**base, diff=None, grade=None,
                       headline=f"이 주유소는 {fuel}{josa(fuel,'을를')} 취급하지 않습니다.",
                       judgeable=False, reason="no_price")

    if n < MIN_STATIONS:
        return Verdict(**base, diff=None, grade=None,
                       headline=f"{region}{josa(region)} {fuel} 파는 곳이 {n}곳뿐이라 비교가 어렵습니다.",
                       judgeable=False, reason="too_few_stations")

    spread = nb_median - nb_min
    if spread < FLAT_SPREAD:
        return Verdict(**base, diff=round(price - nb_median, 1), grade=None,
                       headline=f"{region}{josa(region)} 어디서 넣어도 가격이 거의 같습니다.",
                       judgeable=False, reason="flat_neighborhood")

    # --- 정상 판정 ---
    diff = price - nb_median
    label, key = _grade(diff)
    if abs(diff) < 1:
        head = f"동네 중앙값과 같습니다"
    else:
        word = "비쌉니다" if diff > 0 else "쌉니다"
        head = f"동네 중앙값보다 {abs(round(diff)):,.0f}원 {word}"
    return Verdict(**base, diff=round(diff, 1), grade=key,
                   headline=head, judgeable=True, reason=None)


def neighborhood_report(con, region: str, fuel: str = "휘발유",
                        price_date: str = "2026-09-20"):
    """동네 단위 요약 - 지역 페이지 자동 생성용"""
    col = FUEL_COL[fuel]
    vals = [r[0] for r in con.execute(f"""
        SELECT p.{col} FROM stations s JOIN prices p
          ON p.station_id = s.station_id AND p.price_date = ?
        WHERE s.region = ? AND p.{col} IS NOT NULL ORDER BY p.{col}
    """, (price_date, region))]
    if not vals:
        return None
    m = len(vals)
    med = vals[m // 2] if m % 2 else (vals[m // 2 - 1] + vals[m // 2]) / 2
    return dict(region=region, fuel=fuel, n=m, lo=vals[0], median=med, hi=vals[-1],
                spread_med_min=med - vals[0], spread_hi_lo=vals[-1] - vals[0],
                judgeable=(m >= MIN_STATIONS and med - vals[0] >= FLAT_SPREAD))


if __name__ == "__main__":
    con = sqlite3.connect(DB)

    print("=" * 74)
    print("2순위 기능 시연 - 경기 평택시 (UI 시안에 쓰인 동네)")
    print("=" * 74)
    rep = neighborhood_report(con, "경기 평택시")
    print(f"  {rep['n']}곳 · 최저 {rep['lo']:,.0f} · 중앙 {rep['median']:,.0f} "
          f"· 최고 {rep['hi']:,.0f} · 판정가능={rep['judgeable']}\n")

    ids = [r[0] for r in con.execute("""
        SELECT s.station_id FROM stations s JOIN prices p
          ON p.station_id=s.station_id AND p.price_date='2026-09-20'
        WHERE s.region='경기 평택시' AND p.gasoline IS NOT NULL
        ORDER BY p.gasoline LIMIT 3""")]
    ids += [r[0] for r in con.execute("""
        SELECT s.station_id FROM stations s JOIN prices p
          ON p.station_id=s.station_id AND p.price_date='2026-09-20'
        WHERE s.region='경기 평택시' AND p.gasoline IS NOT NULL
        ORDER BY p.gasoline DESC LIMIT 2""")]
    for sid in ids:
        v = judge(con, sid)
        print(f"  {v.name}  ({v.price:,.0f}원)")
        print(f"    > {v.headline}")
        if v.subline:
            print(f"    > {v.subline}")
        print()

    print("=" * 74)
    print("가드 동작 확인")
    print("=" * 74)
    cases = [("서울 도봉구", "가격차 없는 동네"),
             ("부산 중구", "주유소 1곳"),
             ("서울 용산구", "격차 큰 동네")]
    for region, why in cases:
        sid = con.execute("""
            SELECT s.station_id FROM stations s JOIN prices p
              ON p.station_id=s.station_id AND p.price_date='2026-09-20'
            WHERE s.region=? AND p.gasoline IS NOT NULL LIMIT 1""", (region,)).fetchone()
        if not sid:
            print(f"  [{why}] {region}: 해당 없음\n"); continue
        v = judge(con, sid[0])
        print(f"  [{why}] {region} · {v.name}")
        print(f"    > {v.headline}   (판정가능={v.judgeable}, 사유={v.reason})\n")

    # 고급휘발유 미취급 가드
    sid = con.execute("""SELECT station_id FROM prices
                         WHERE price_date='2026-09-20' AND premium_gasoline IS NULL
                         LIMIT 1""").fetchone()[0]
    v = judge(con, sid, fuel="고급휘발유")
    print(f"  [미취급 연료] {v.name}")
    print(f"    > {v.headline}   (사유={v.reason})\n")

    # 전국 등급 분포
    print("=" * 74)
    print("전국 판정 분포 (휘발유)")
    print("=" * 74)
    from collections import Counter
    cnt, rea = Counter(), Counter()
    allids = [r[0] for r in con.execute("SELECT station_id FROM stations")]
    for s in allids:
        v = judge(con, s)
        if v.judgeable:
            cnt[v.grade] += 1
        else:
            rea[v.reason] += 1
    tot = sum(cnt.values())
    for _, _, label, key in GRADES:
        print(f"  {label:<14} {cnt[key]:>6,}곳  ({cnt[key]/tot*100:5.1f}%)")
    print(f"  {'판정 계':<14} {tot:>6,}곳")
    print("  판정 생략:", dict(rea))
    con.close()
