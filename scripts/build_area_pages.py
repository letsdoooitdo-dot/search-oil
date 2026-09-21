#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
"우리 동네" 지역 페이지 생성 (/area/)
=====================================
시군구 230개. 애드센스 수익의 본체 - 검색 롱테일로 유입되는 페이지들이다.

★ 핵심 원칙: 숫자만 찍어내면 안 된다.
   대량 자동 생성 페이지가 값만 다르고 내용이 같으면 애드센스가 "가치 없는 콘텐츠"로
   판정하고, 구글도 색인에서 뺀다. 그래서 동네마다 다른 '해설'을 만들어낸다.

   해설을 가르는 축 세 가지 (전부 실측에서 나온다)
     1) 격차   - 동네 안 최저~최고 차이. 성북구 714원 vs 화천군 32원.
                 격차가 크면 "고르면 이득", 작으면 "아무 데나 넣어도 같다"로 결론이 뒤집힌다.
     2) 전국 위치 - 이 동네가 전국에서 몇 번째로 싼가.
     3) 1년 성격 - 늘 최저권 주유소가 몇 곳인가. 오늘만 싼 집과 계속 싼 집은 다르다.

표준 라이브러리만 사용.
"""

import os
import sqlite3
import statistics as st
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import route_gain as rg
import verdict as vd
from ui import esc, display_name, ad_slot, page_shell

DB = rg.DB
import figures

# 기준일은 박아두지 않는다. 새 가격이 들어오면 페이지도 따라 바뀌어야 한다.
PRICE_DATE = figures.latest_price_date()
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "area")

ACCENT = "#A54A04"

# 격차 해석 경계 (원). 실측 분포에서 잡았다 - 중앙값 근처가 100원대, 상위가 400원 이상.
SPREAD_BIG = 250      # 이 이상이면 "고르면 크게 이득"
SPREAD_SMALL = 60     # 이 미만이면 "어디서 넣어도 비슷"


def collect(con):
    """시군구별 오늘 가격 + 1년 성격을 한 번에 모은다."""
    regions = {}
    for region, price, character, name, brand, is_self, sid in con.execute(f"""
        SELECT s.region, p.gasoline, c.character, s.name, s.brand, s.is_self, s.station_id
        FROM stations s
        JOIN prices p ON p.station_id = s.station_id AND p.price_date = '{PRICE_DATE}'
        LEFT JOIN station_character c ON c.station_id = s.station_id
        WHERE p.gasoline IS NOT NULL
    """):
        regions.setdefault(region, []).append(
            dict(price=price, character=character, name=name,
                 brand=brand, is_self=is_self, sid=sid))
    return regions


def summarize(region, rows, national_median):
    prices = sorted(r["price"] for r in rows)
    med = st.median(prices)
    return dict(
        region=region, n=len(rows), lo=prices[0], hi=prices[-1], median=med,
        spread=prices[-1] - prices[0],
        vs_national=med - national_median,
        always_cheap=[r for r in rows if r["character"] == "늘 최저권"],
        always_pricey=sum(1 for r in rows if r["character"] == "늘 최고권"),
        self_n=sum(1 for r in rows if r["is_self"]),
        rows=rows,
    )


def verdict_line(s, rank, total):
    """동네마다 다른 결론 문장. 이게 페이지의 고유성을 만든다."""
    won50 = s["spread"] * 50
    if s["spread"] >= SPREAD_BIG:
        head = f"{s['region']}는 주유소를 고를 가치가 큽니다"
        body = (f"같은 {s['region']} 안에서 최저 {s['lo']:,.0f}원, 최고 {s['hi']:,.0f}원으로 "
                f"<b>{s['spread']:,.0f}원</b> 차이가 납니다. 50L를 넣는다면 한 번 주유에 "
                f"<b>{won50:,.0f}원</b>이 갈립니다. 아무 데나 들어가면 손해를 보는 동네입니다.")
    elif s["spread"] < SPREAD_SMALL:
        # 제일 싼 곳까지 몇 km를 더 가면 본전인지 - 이 거리가 짧으면 찾아다닐 이유가 없다.
        be_km = rg.breakeven_detour_km(s["spread"], liters=50.0, fuel_price=s["median"])
        head = f"{s['region']}는 어디서 넣어도 비슷합니다"
        body = (f"동네 안에서 가장 싼 곳과 가장 비싼 곳의 차이가 <b>{s['spread']:,.0f}원</b>뿐입니다. "
                f"제일 싼 집을 찾아가더라도 <b>{be_km:.1f}km</b>만 더 돌면 아낀 돈이 기름값으로 사라집니다. "
                f"가는 길에 보이는 곳에서 넣으시면 됩니다.")
    else:
        head = f"{s['region']}는 조금 따져볼 만합니다"
        body = (f"동네 안 가격 차이가 <b>{s['spread']:,.0f}원</b>입니다. 50L면 {won50:,.0f}원 차이라, "
                f"멀리 돌아갈 정도는 아니지만 가는 길에 싼 곳이 있다면 들를 만합니다.")

    diff = s["vs_national"]
    if abs(diff) < 5:
        nat = f"전국 중앙값과 거의 같은 수준입니다 (전국 {total}개 시군구 중 {rank}번째로 저렴)."
    elif diff < 0:
        nat = (f"전국 중앙값보다 <b>{abs(diff):,.0f}원 저렴</b>한 동네입니다 "
               f"(전국 {total}개 시군구 중 {rank}번째).")
    else:
        nat = (f"전국 중앙값보다 <b>{diff:,.0f}원 비싼</b> 동네입니다 "
               f"(전국 {total}개 시군구 중 {rank}번째로 저렴).")
    return head, body, nat


def character_line(s):
    """'오늘만 싼 집'과 '1년 내내 싼 집'의 차이 - 우리만 쓸 수 있는 내용."""
    n_always = len(s["always_cheap"])
    if n_always == 0:
        return ("이 동네에는 1년 내내 최저권을 지킨 주유소가 없습니다. "
                "오늘 싼 곳이 다음 달에도 싸다는 보장이 없으니, 넣기 전에 매번 확인하는 편이 낫습니다.")
    if n_always == 1:
        return (f"이 동네에서 1년 내내 최저권을 지킨 주유소는 <b>단 한 곳</b>입니다. "
                f"오늘 하루 싼 집과 계속 싼 집은 다릅니다.")
    return (f"1년 내내 최저권을 지킨 주유소가 <b>{n_always}곳</b> 있습니다. "
            f"반대로 1년 내내 비싼 축이었던 곳도 {s['always_pricey']}곳입니다.")


def station_rows(s, limit=8):
    """실용 정보 - 오늘 싼 순서. 1년 성격 배지를 같이 붙여 단순 목록과 차별화한다."""
    # 같은 값이면 1년 내내 최저권을 지킨 집을 위로 - 오늘 우연히 싼 집보다 쓸모가 크다.
    rows = sorted(s["rows"], key=lambda r: (r["price"], r["character"] != "늘 최저권"))[:limit]
    out = []
    for i, r in enumerate(rows):
        nm = display_name(r["name"])
        badge = ""
        if r["character"] == "늘 최저권":
            badge = '<span style="font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 5px; background: #E4F2E8; color: #0F5628; margin-left: 5px;">1년 내내 최저권</span>'
        elif r["character"] == "늘 최고권":
            badge = '<span style="font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 5px; background: #FBEAE4; color: #A54A04; margin-left: 5px;">오늘만 쌈</span>'
        self_tag = ' <span style="font-size: 10.5px; color: #6B7679;">셀프</span>' if r["is_self"] else ""
        bg = "background: #F5F7F6;" if i % 2 else ""
        out.append(f"""
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; {bg}">
          <span style="font-size: 12.5px; color: #13181A; min-width: 0;">{esc(nm)}{self_tag}{badge}</span>
          <span style="font-size: 13px; font-weight: 700; color: #13181A; flex-shrink: 0;">{r['price']:,.0f}원</span>
        </div>""")
    return "".join(out)


def build_page(s, rank, total, national_median):
    head, body_txt, nat = verdict_line(s, rank, total)
    region = s["region"]

    inner = f"""
  <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 11px; flex-grow: 1;">

    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">우리 동네 기름값</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900; letter-spacing: -0.025em; color: #13181A; line-height: 1.3;">{esc(head)}</h1>
    </div>

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      <p style="margin: 0; font-size: 13.5px; line-height: 1.65; color: #4A5558;">{body_txt}</p>
      <p style="margin: 10px 0 0; font-size: 13px; line-height: 1.65; color: #4A5558;">{nat}</p>

      <div style="margin-top: 14px; border: 1px solid #E9EEEC; border-radius: 11px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">주유소</span><span style="font-weight: 600; color: #13181A;">{s['n']}곳 (셀프 {s['self_n']}곳)</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">최저 ~ 최고</span><span style="font-weight: 600; color: #13181A;">{s['lo']:,.0f} ~ {s['hi']:,.0f}원</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; background: #F5F7F6;">
          <span style="color: #5B666A;">동네 중앙값</span><span style="font-weight: 700; color: {ACCENT};">{s['median']:,.0f}원</span>
        </div>
      </div>
    </div>

    {ad_slot()}

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px 0 6px;">
      <div style="padding: 0 16px 10px;">
        <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">오늘 싼 순서</div>
        <p style="margin: 6px 0 0; font-size: 12.5px; line-height: 1.6; color: #4A5558;">{character_line(s)}</p>
      </div>
      {station_rows(s)}
    </div>

    <a href="/" style="display: flex; justify-content: space-between; align-items: center; background: #13181A; border-radius: 14px; padding: 14px;">
      <span style="font-size: 13px; font-weight: 700; color: #FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>
  </div>

  <div style="padding: 12px 16px 18px;">
    <p style="margin: 0; font-size: 11px; color: #5B666A; line-height: 1.55;">
      {esc(region)} · {PRICE_DATE[:4]}년 {int(PRICE_DATE[5:7])}월 {int(PRICE_DATE[8:10])}일 휘발유 실제 판매가 {s['n']}곳 기준 ·
      1년 성격은 최근 1년 일별 가격으로 산출 · 출처 오피넷
    </p>
  </div>
"""
    title = f"{region} 기름값 - 최저 {s['lo']:,.0f}원, 주유소 {s['n']}곳 비교"
    desc = (f"{region} 휘발유 최저 {s['lo']:,.0f}원, 중앙값 {s['median']:,.0f}원. "
            f"동네 안 가격차 {s['spread']:,.0f}원. 1년 내내 싼 주유소까지 실제 데이터로 비교합니다.")
    return page_shell(title, ACCENT, inner, active="/area/", description=desc)


def slug(region):
    return region.replace(" ", "-")


def build_index(summaries, national_median):
    """230개 페이지로 들어가는 입구. 시도별로 묶고, 격차 큰 동네를 위에 띄운다."""
    top = sorted(summaries, key=lambda s: -s["spread"])[:10]
    top_rows = "".join(f"""
        <a href="/area/{slug(s['region'])}.html" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; {'background: #F5F7F6;' if i % 2 else ''}">
          <span style="font-size: 12.5px; color: #13181A;">{esc(s['region'])}</span>
          <span style="font-size: 12.5px; font-weight: 700; color: {ACCENT}; flex-shrink: 0;">{s['spread']:,.0f}원 차이</span>
        </a>""" for i, s in enumerate(top))

    by_sido = {}
    for s in sorted(summaries, key=lambda s: s["region"]):
        by_sido.setdefault(s["region"].split()[0], []).append(s)
    sido_blocks = "".join(f"""
      <div style="padding: 12px 16px; border-top: 1px solid #E9EEEC;">
        <div style="font-size: 12px; font-weight: 700; color: #13181A; margin-bottom: 7px;">{esc(sido)}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
          {''.join(f'<a href="/area/{slug(s["region"])}.html" style="font-size: 11.5px; padding: 4px 9px; border-radius: 7px; border: 1px solid #DDE3E1; color: #4A5558;">{esc(s["region"].split(maxsplit=1)[1] if " " in s["region"] else s["region"])}</a>' for s in items)}
        </div>
      </div>""" for sido, items in by_sido.items())

    inner = f"""
  <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 11px; flex-grow: 1;">
    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">우리 동네 기름값</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900; letter-spacing: -0.025em; color: #13181A; line-height: 1.3;">전국 {len(summaries)}개 시군구<br>기름값을 비교했습니다</h1>
      <p style="margin: 9px 0 0; font-size: 13px; line-height: 1.65; color: #4A5558;">
        오늘 전국 휘발유 중앙값은 <b style="color: #13181A;">{national_median:,.0f}원</b>입니다.
        같은 동네 안에서도 가격 차이가 큰 곳과 거의 없는 곳이 갈립니다. 우리 동네는 어느 쪽인지 확인해보세요.
      </p>
    </div>

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 14px 0 6px;">
      <div style="padding: 0 16px 8px;">
        <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">주유소를 고를 가치가 큰 동네</div>
        <p style="margin: 5px 0 0; font-size: 12px; line-height: 1.6; color: #4A5558;">동네 안 최저~최고 차이가 가장 큰 곳들입니다. 아무 데나 들어가면 손해가 큽니다.</p>
      </div>
      {top_rows}
    </div>

    {ad_slot()}

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 14px 0 8px;">
      <div style="padding: 0 16px;">
        <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">지역으로 찾기</div>
      </div>
      {sido_blocks}
    </div>

    <a href="/" style="display: flex; justify-content: space-between; align-items: center; background: #13181A; border-radius: 14px; padding: 14px;">
      <span style="font-size: 13px; font-weight: 700; color: #FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>
  </div>

  <div style="padding: 12px 16px 18px;">
    <p style="margin: 0; font-size: 11px; color: #5B666A; line-height: 1.55;">
      {PRICE_DATE[:4]}년 {int(PRICE_DATE[5:7])}월 {int(PRICE_DATE[8:10])}일 휘발유 실제 판매가 기준 · 출처 오피넷
    </p>
  </div>
"""
    return page_shell(f"전국 {len(summaries)}개 시군구 기름값 비교 - 주유소찾기", ACCENT, inner,
                      active="/area/",
                      description=f"전국 시군구별 휘발유 가격을 실제 판매가로 비교합니다. "
                                  f"오늘 전국 중앙값 {national_median:,.0f}원.")


def main():
    only = sys.argv[1:] or None
    con = sqlite3.connect(DB)
    regions = collect(con)

    all_prices = sorted(r["price"] for rows in regions.values() for r in rows)
    national_median = st.median(all_prices)

    summaries = [summarize(rg_, rows, national_median)
                 for rg_, rows in regions.items() if len(rows) >= 5]
    summaries.sort(key=lambda s: s["median"])
    total = len(summaries)

    os.makedirs(OUT_DIR, exist_ok=True)
    made = 0
    for rank, s in enumerate(summaries, start=1):
        if only and s["region"] not in only:
            continue
        path = os.path.join(OUT_DIR, f"{slug(s['region'])}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(build_page(s, rank, total, national_median))
        made += 1

    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_index(summaries, national_median))

    con.close()
    print(f"전국 중앙값 {national_median:,.0f}원 · 대상 {total}개 시군구 · {made}개 페이지 + index 작성")
    print(f"경로: {OUT_DIR}")


if __name__ == "__main__":
    main()
