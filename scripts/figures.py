#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
페이지가 인용하는 모든 숫자를 DB에서 계산한다
==============================================
"수동 작업 0" 의 핵심. 계산기 기준값도, 리포트 본문 속 숫자도 전부 여기서 나온다.
페이지 생성기에 숫자를 박아두면 데이터가 갱신돼도 글이 옛날 값을 말하게 된다.

★ check_claims()
  리포트 본문은 숫자뿐 아니라 '주장'을 담는다 ("요일 차이는 의미 없다").
  숫자가 바뀌어 그 주장이 더 이상 참이 아니게 되면 자동 갱신은 오히려 거짓말이 된다.
  그래서 글이 전제하는 범위를 벗어나면 빌드가 경고하도록 했다.

표준 라이브러리만 사용.
"""

import os
import sqlite3
import statistics as st

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oil.db")

MIN_BRAND_N = 50        # 브랜드 비교에 넣을 최소 곳수
MIN_REGION_N = 10       # 지역 격차 비교에 넣을 최소 곳수
FUEL_COL = {"휘발유": "gasoline", "경유": "diesel"}


def connect():
    return sqlite3.connect(DB)


def latest_date(con) -> str:
    return con.execute("SELECT MAX(price_date) FROM prices").fetchone()[0]


def latest_price_date() -> str:
    """페이지 생성기가 기준일을 박아두지 않고 DB에서 가져가도록 하는 편의 함수."""
    con = connect()
    try:
        return latest_date(con)
    finally:
        con.close()


def _median(v):
    return float(st.median(v)) if v else None


def national(con, day, fuel="휘발유"):
    col = FUEL_COL[fuel]
    v = sorted(r[0] for r in con.execute(
        f"SELECT {col} FROM prices WHERE price_date=? AND {col} IS NOT NULL", (day,)))
    return dict(n=len(v), low=v[0], median=_median(v), high=v[-1])


def self_vs_full(con, day, fuel="휘발유"):
    col = FUEL_COL[fuel]
    out = {}
    for flag, key in ((1, "self"), (0, "full")):
        v = [r[0] for r in con.execute(
            f"""SELECT p.{col} FROM stations s JOIN prices p
                ON p.station_id=s.station_id AND p.price_date=?
                WHERE p.{col} IS NOT NULL AND s.is_self=?""", (day, flag))]
        out[key] = dict(n=len(v), median=_median(v))
    out["gap"] = out["full"]["median"] - out["self"]["median"]
    return out


def brand_table(con, day, fuel="휘발유"):
    """브랜드별 셀프/일반 중앙값. 셀프끼리 비교해야 '셀프 효과'가 섞이지 않는다."""
    col = FUEL_COL[fuel]
    rows = con.execute(
        f"""SELECT s.brand, s.is_self, p.{col} FROM stations s JOIN prices p
            ON p.station_id=s.station_id AND p.price_date=?
            WHERE p.{col} IS NOT NULL""", (day,))
    acc = {}
    for brand, is_self, price in rows:
        acc.setdefault(brand, {0: [], 1: []})[is_self].append(price)

    out = []
    for brand, d in acc.items():
        n_self, n_full = len(d[1]), len(d[0])
        if n_self + n_full < 100:
            continue
        out.append(dict(
            brand=brand, n_self=n_self, n_full=n_full,
            self_median=_median(d[1]), full_median=_median(d[0]),
            self_ratio=n_self / (n_self + n_full) * 100,
            self_gap=(_median(d[0]) - _median(d[1])) if (n_self >= MIN_BRAND_N and n_full >= MIN_BRAND_N) else None,
        ))
    out.sort(key=lambda r: (r["self_median"] is None, r["self_median"]))
    return out


def region_spreads(con, day, fuel="휘발유"):
    col = FUEL_COL[fuel]
    acc = {}
    for region, price in con.execute(
            f"""SELECT s.region, p.{col} FROM stations s JOIN prices p
                ON p.station_id=s.station_id AND p.price_date=?
                WHERE p.{col} IS NOT NULL""", (day,)):
        acc.setdefault(region, []).append(price)
    out = [dict(region=r, n=len(v), low=min(v), high=max(v),
                spread=max(v) - min(v), median=_median(v))
           for r, v in acc.items() if len(v) >= MIN_REGION_N]
    out.sort(key=lambda r: -r["spread"])
    return out


def weekday_stats(con):
    """1년 요일별 전국 중앙가 평균. 최저 요일 대비 차이까지."""
    acc = {}
    for wd, med in con.execute("SELECT weekday, nat_median FROM market_phase"):
        acc.setdefault(wd, []).append(med)
    base = min(sum(v) / len(v) for v in acc.values())
    order = ["일", "월", "화", "수", "목", "금", "토"]
    rows = [dict(weekday=wd, n=len(acc[wd]), avg=sum(acc[wd]) / len(acc[wd]),
                 vs_min=sum(acc[wd]) / len(acc[wd]) - base)
            for wd in order if wd in acc]
    rows.sort(key=lambda r: r["vs_min"])
    return rows


def phase_moves(con, days=7):
    """국면별로 N일 뒤 가격이 얼마나 움직였나. fill_amount 의 상수 근거."""
    from datetime import date, timedelta
    rows = list(con.execute("SELECT price_date, nat_median, phase FROM market_phase ORDER BY price_date"))
    price = {d: m for d, m, _ in rows}
    acc = {}
    for d, m, ph in rows:
        nxt = (date.fromisoformat(d) + timedelta(days=days)).isoformat()
        if nxt in price:
            acc.setdefault(ph, []).append(price[nxt] - m)
    return {ph: dict(n=len(v), avg=sum(v) / len(v),
                     up_ratio=sum(1 for x in v if x > 0) / len(v) * 100)
            for ph, v in acc.items()}


def snapshot(con=None):
    """페이지들이 쓰는 값을 한 번에 모은다."""
    own = con is None
    con = con or connect()
    try:
        day = latest_date(con)
        gas = national(con, day, "휘발유")
        diesel = national(con, day, "경유")
        sf = self_vs_full(con, day)
        brands = brand_table(con, day)
        regions = region_spreads(con, day)
        by_median = sorted(regions, key=lambda r: r["median"])
        wd = weekday_stats(con)
        moves = phase_moves(con)
        return dict(
            date=day, gas=gas, diesel=diesel, self_full=sf, brands=brands,
            regions=regions, region_cheap=by_median[0], region_pricey=by_median[-1],
            weekday=wd, weekday_gap=wd[-1]["vs_min"] if wd else 0.0,
            phase_moves=moves,
            region_spread_median=_median([r["spread"] for r in regions]),
        )
    finally:
        if own:
            con.close()


# ── 글이 전제하는 범위 ──────────────────────────────────────────────────────
# 숫자가 여기를 벗어나면 본문의 주장이 더 이상 참이 아니다 -> 사람이 다시 써야 한다.
CLAIMS = [
    ("요일 차이가 무의미하다", lambda s: s["weekday_gap"] < 15,
     lambda s: f"요일 최대 격차 {s['weekday_gap']:.1f}원"),
    ("4대 정유사 차이가 작다", lambda s: _major_gap(s) is not None and _major_gap(s) < 30,
     lambda s: f"4사 셀프 중앙값 격차 {_major_gap(s):.0f}원"),
    ("셀프가 일반보다 확실히 싸다", lambda s: s["self_full"]["gap"] > 15,
     lambda s: f"셀프-일반 격차 {s['self_full']['gap']:.0f}원"),
    ("동네 안 격차가 큰 곳이 존재한다", lambda s: s["regions"][0]["spread"] > 300,
     lambda s: f"최대 격차 {s['regions'][0]['region']} {s['regions'][0]['spread']:.0f}원"),
    ("상승장에서 미루면 확실히 손해다", lambda s: s["phase_moves"].get("상승", {}).get("avg", 0) > 10,
     lambda s: f"상승장 7일 후 {s['phase_moves'].get('상승', {}).get('avg', 0):+.1f}원"),
]

MAJORS = ("SK에너지", "GS칼텍스", "HD현대오일뱅크", "S-OIL")


def _major_gap(s):
    v = [b["self_median"] for b in s["brands"]
         if b["brand"] in MAJORS and b["self_median"] is not None]
    return (max(v) - min(v)) if len(v) >= 2 else None


def check_claims(s):
    """본문 주장이 아직 참인지 확인. 깨진 항목 목록을 돌려준다."""
    broken = []
    for name, ok, describe in CLAIMS:
        try:
            if not ok(s):
                broken.append((name, describe(s)))
        except Exception as e:
            broken.append((name, f"확인 실패: {e}"))
    return broken


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    s = snapshot()
    print(f"기준일 {s['date']}")
    print(f"휘발유 중앙 {s['gas']['median']:,.0f}원 ({s['gas']['n']:,}곳) · 경유 {s['diesel']['median']:,.0f}원")
    print(f"셀프 {s['self_full']['self']['median']:,.0f} / 일반 {s['self_full']['full']['median']:,.0f} "
          f"→ 격차 {s['self_full']['gap']:,.0f}원")
    print(f"지역 중앙값 최저 {s['region_cheap']['region']} {s['region_cheap']['median']:,.0f}원 / "
          f"최고 {s['region_pricey']['region']} {s['region_pricey']['median']:,.0f}원")
    print(f"동네 격차 최대 {s['regions'][0]['region']} {s['regions'][0]['spread']:,.0f}원 · "
          f"중앙값 {s['region_spread_median']:,.0f}원")
    print(f"요일 최대 격차 {s['weekday_gap']:.1f}원")
    print("브랜드(셀프 중앙값):", ", ".join(
        f"{b['brand']} {b['self_median']:,.0f}" for b in s["brands"][:7] if b["self_median"]))
    broken = check_claims(s)
    print("\n주장 점검:", "전부 유효" if not broken else "")
    for name, detail in broken:
        print(f"  [깨짐] {name} — {detail}")
