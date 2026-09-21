#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
9장 "다음 할 일" - 화면 두 장을 실제 데이터로 렌더링한다.
==========================================================
Design 아티팩트 「지도 UX 3안 비교」에서 채택된 B안(도식 미니맵)의
레이아웃·색·폰트를 그대로 쓰되, 값은 전부 oil.db 실측으로 채운다.

  screen_24_detour.html  - 24% 화면 "여기서 넣으세요" (route_gain.decide verdict=detour)
  screen_76_stay.html    - 76% 화면 "그냥 넣으세요"   (route_gain.decide verdict=stay)
                            + fill_amount 통합 (인수인계서 9장이 지목한 "제일 큰 구멍")

예시 출발/목적지 좌표는 실제 GPS 입력이 아니라, oil.db에 이미 있는 실제 주유소
분포에서 "다녀본 것 같은" 경로 두 개를 골라 넣은 표본이다. 화면·문구·계산 로직은
전부 진짜고, 좌표만 나중에 실제 사용자 입력으로 교체하면 된다.

표준 라이브러리만 사용 (프로젝트 규칙 - PyPI 설치 불가).
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import route_gain as rg
import verdict as vd
import fill_amount as fa
from ui import esc, display_name, title_font_px, site_nav, ad_slot, page_shell, url

DB = rg.DB
import figures

# 기준일은 박아두지 않는다. 새 가격이 들어오면 페이지도 따라 바뀌어야 한다.
PRICE_DATE = figures.latest_price_date()
TODAY = date(2026, 9, 21)
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # search_oil/

CHARACTER_BADGE = {
    "늘 최저권": "1년 내내 최저권",
    "싼 편": "1년 평균 싼 편",
    "보통": "1년 내내 동네 평균",
    "비싼 편": "1년 평균 비싼 편",
    "늘 최고권": "1년 내내 최고권",
}

def svg_label_anchor(x: float, lo: float = 60.0, hi: float = 266.0):
    """도식 라벨이 좌우 끝에서 잘리지 않도록 정렬 기준을 뒤집는다."""
    if x < lo:
        return "start", 8.0
    if x > hi:
        return "end", 318.0
    return "middle", x


def route_t(point, seg_a, seg_b):
    """perpendicular_km과 같은 투영을 쓰되, 선분 위 위치(0~1)를 돌려준다 (SVG 배치용)."""
    lat0 = (seg_a[0] + seg_b[0]) / 2
    px, py = rg._to_xy(point, lat0)
    ax, ay = rg._to_xy(seg_a, lat0)
    bx, by = rg._to_xy(seg_b, lat0)
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy
    if L2 == 0:
        return 0.0
    t = ((px - ax) * vx + (py - ay) * vy) / L2
    return max(0.0, min(1.0, t))


def area_link(region: str):
    """판정 화면 -> 지역 페이지. 탭 간 순환이 체류시간을 가장 크게 늘린다."""
    return f"""
    <a href="{url('/area/')}" style="display: flex; justify-content: space-between; align-items: center;
       background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 14px; padding: 12px 14px;">
      <span style="font-size: 12.5px; color: #4A5558;"><b style="font-weight: 700; color: #13181A;">{esc(region)}</b> 기름값 이야기</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""


def top_bar(origin_label, dest_label, fuel="휘발유"):
    tabs = ["휘발유", "경유", "일반 승용차"]
    tab_html = []
    for t in tabs:
        active = (t == fuel)
        bg = "#13181A" if active else "#FFFFFF"
        col = "#FFFFFF" if active else "#4A5558"
        border = "" if active else "border: 1px solid #DDE3E1;"
        weight = 600 if active else 500
        tab_html.append(
            f'<span style="flex-grow: 1; text-align: center; font-size: 12px; font-weight: {weight}; '
            f'padding: 7px 0; border-radius: 9px; {border} background: {bg}; color: {col};">{esc(t)}</span>'
        )
    return f"""
  <div style="padding: 14px 16px 0; display: flex; flex-direction: column; gap: 10px;">
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 12px;">
      <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A5558" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>
        <span style="font-size: 13.5px; font-weight: 600; color: #13181A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{esc(origin_label)} → {esc(dest_label)}</span>
      </div>
      <a href="#edit" style="font-size: 12px; font-weight: 600; flex-shrink: 0;">변경</a>
    </div>
    <div style="display: flex; gap: 6px;">
      {''.join(tab_html)}
    </div>
  </div>"""


def footer(region, price_date, n_candidates):
    return f"""
  <div style="padding: 10px 16px 18px;">
    <p style="margin: 0; font-size: 11px; color: #5B666A; line-height: 1.55;">{esc(region)} · {price_date[:4]}년 {int(price_date[5:7])}월 {int(price_date[8:10])}일 실제 가격 · 경로상 주유소 {n_candidates}곳 중</p>
  </div>"""


def fill_amount_card(advice, phase, event, vehicle_label="일반 승용차"):
    strong_style = ("border: 1px solid #0B6B60; box-shadow: 0 0 0 3px #E2F1EE;"
                    if advice.strong else "border: 1px solid #DDE3E1;")
    cap = (f'<div style="margin-top: 8px; font-size: 11.5px; color: #A54A04; font-weight: 600;">· {esc(advice.cap_note)}</div>'
           if advice.cap_note else "")
    gain_line = (f'<div style="margin-top: 8px; font-size: 12px; color: #0A5850; font-weight: 600;">평소대로 넣는 것보다 {advice.extra_gain:,.0f}원 이득</div>'
                 if advice.extra_gain > 0 else "")
    return f"""
    <div style="background: #FFFFFF; {strong_style} border-radius: 14px; padding: 14px 16px;">
      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #5B666A;">얼마나 넣을까 · {esc(vehicle_label)} · 오늘 국면 {esc(phase)}</span>
      <div style="font-family: 'Gothic A1', sans-serif; font-size: 21px; font-weight: 900; color: #13181A; margin-top: 6px;">{esc(advice.headline)}</div>
      <p style="margin: 6px 0 0; font-size: 12.5px; line-height: 1.6; color: #4A5558;">{esc(advice.reason)}</p>
      {gain_line}
      {cap}
    </div>"""


# ── 24% 화면 : 여기서 넣으세요 (detour) ──────────────────────────────────────
def build_detour_screen(con):
    region = "경기 평택시"
    origin = (37.00200824219195, 126.98619122902377)
    dest = (37.040131035532085, 127.03925272390254)

    cands = rg.load_candidates(con, region, price_date=PRICE_DATE)
    baseline = rg.baseline_for(con, region, price_date=PRICE_DATE)
    provider = rg.StraightLineRoute(road_factor=1.3)
    dec = rg.decide(cands, origin, dest, baseline, provider)
    assert dec.verdict == "detour", f"시나리오가 바뀌었습니다: {dec.verdict}"

    pick = dec.pick
    v = vd.judge(con, pick.station_id, price_date=PRICE_DATE)
    is_self, addr = con.execute(
        "SELECT is_self, addr FROM stations WHERE station_id=?", (pick.station_id,)
    ).fetchone()
    inside = rg.corridor_filter(cands, origin, dest)

    ph = fa.today_phase(con, as_of=PRICE_DATE)
    ev = fa.upcoming_event(TODAY)
    advice = fa.recommend(vehicle="일반", phase=ph, event=ev)

    t_pick = route_t((pick.lat, pick.lng), origin, dest)
    x_pick = 22 + t_pick * (304 - 22)
    pick_name = display_name(pick.name)
    pick_anchor, pick_label_x = svg_label_anchor(x_pick)

    badge = CHARACTER_BADGE.get(v.character, v.character or "")
    self_badge = '<span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; border: 1px solid #DDE3E1; color: #4A5558;">셀프</span>' if is_self else ""

    runner_txt = ""
    if dec.runner_up:
        r = dec.runner_up
        r_name = display_name(r.name)
        gap = pick.price - r.price
        gap_txt = f"{abs(gap):.0f}원 {'더 싼데' if gap > 0 else '더 비싼데'}" if gap != 0 else "같은 값인데"
        runner_txt = (f"경로에 있는 다른 후보 {r_name}{vd.josa(r_name)} {gap_txt} "
                      f"{r.detour_km:.1f}km 더 돌아가야 해서 {max(0, (r.gain or 0)):,.0f}원 남습니다.")

    body = top_bar("현위치", "회사")
    body += f"""
  <div style="padding: 14px 16px 0; display: flex; flex-direction: column; gap: 11px; flex-grow: 1;">

    <div style="background: #FFFFFF; border: 1px solid #D96206; border-radius: 16px; box-shadow: 0 0 0 3px #FDF0E4; padding: 18px 16px 16px; display: flex; flex-direction: column;">
      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #A54A04;">여기서 넣으세요</span>
      <h1 style="margin: 4px 0 0; font-family: 'Gothic A1', sans-serif; font-size: {title_font_px(pick_name, 22)}px; font-weight: 900; letter-spacing: -0.02em; color: #13181A; line-height: 1.25;">{esc(pick_name)}</h1>
      <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
        <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; border: 1px solid #DDE3E1; color: #4A5558;">{esc(pick.brand)}</span>
        {self_badge}
        <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: #E4F2E8; color: #0F5628;">{esc(badge)}</span>
      </div>

      <div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed #DDE3E1;">
        <div style="font-size: 12px; color: #5B666A; font-weight: 500;">{dec.liters:.0f}L 넣으면</div>
        <div style="font-family: 'Gothic A1', sans-serif; font-size: 40px; font-weight: 900; letter-spacing: -0.03em; color: #A54A04; line-height: 1.1; margin-top: 2px;">{dec.pick.gain:,.0f}<span style="font-size: 19px; margin-left: 2px;">원 절약</span></div>
      </div>

      <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid #E9EEEC;">
        <svg viewBox="0 62 326 80" style="display: block; width: 100%; height: auto;" role="img" aria-label="경로 도식. 추천 주유소는 가는 길에서 {pick.detour_km*1000:.0f}미터 벗어나 있습니다.">
          <line x1="22" y1="86" x2="304" y2="86" stroke="#C6D0CD" stroke-width="7" stroke-linecap="round"></line>
          <line x1="22" y1="86" x2="304" y2="86" stroke="#7C888B" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 7"></line>

          <circle cx="22" cy="86" r="6" fill="#13181A"></circle>
          <circle cx="304" cy="86" r="6" fill="none" stroke="#13181A" stroke-width="2.5"></circle>
          <text x="14" y="104" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">현위치</text>
          <text x="312" y="104" text-anchor="end" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">목적지</text>

          <line x1="{x_pick:.0f}" y1="86" x2="{x_pick:.0f}" y2="100" stroke="#D96206" stroke-width="2"></line>
          <circle cx="{x_pick:.0f}" cy="86" r="7" fill="#D96206"></circle>
          <circle cx="{x_pick:.0f}" cy="86" r="11" fill="none" stroke="#D96206" stroke-width="1.5" opacity="0.35"></circle>
          <text x="{pick_label_x:.0f}" y="122" text-anchor="{pick_anchor}" font-size="12" font-weight="700" fill="#A54A04" font-family="IBM Plex Sans KR, sans-serif">{esc(pick_name)} · {pick.price:,.0f}원</text>
          <text x="{pick_label_x:.0f}" y="135" text-anchor="{pick_anchor}" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">가는 길에서 {pick.detour_km*1000:.0f}m</text>
        </svg>
      </div>

      <p style="margin: 12px 0 0; font-size: 12px; line-height: 1.6; color: #4A5558; background: #F5F7F6; border-radius: 10px; padding: 10px 12px;">
        {esc(dec.reason)}{(' ' + esc(runner_txt)) if runner_txt else ''}
      </p>
    </div>

    {ad_slot()}

    {fill_amount_card(advice, ph, ev)}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <button type="button" style="padding: 13px 0; border-radius: 12px; border: 1px solid #DDE3E1; background: #FFFFFF; color: #13181A; font-size: 13.5px; font-weight: 700; cursor: pointer;">가격 알림</button>
      <a href="#navi" style="padding: 13px 0; border-radius: 12px; background: #D96206; color: #FFFFFF; font-size: 13.5px; font-weight: 700; text-align: center;">카카오맵 길찾기</a>
    </div>

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 14px; padding: 11px 14px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 12.5px; font-weight: 700; color: #13181A;">다른 후보 {max(0, len(inside)-1)}곳</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
    </div>

    {area_link(region)}
  </div>
"""
    body += footer(region, PRICE_DATE, len(inside))
    return page_shell(f"{pick_name} · 여기서 넣으세요 - 주유소찾기", "#A54A04", body, active="/",
                      description=f"{region} {pick_name}에서 {dec.liters:.0f}L 넣으면 {dec.pick.gain:,.0f}원 절약. 가는 길에서 {pick.detour_km*1000:.0f}m.")


# ── 76% 화면 : 그냥 넣으세요 (stay) ──────────────────────────────────────────
def build_stay_screen(con):
    region = "경기 화성시"
    origin = (37.1917360895463, 126.87814202752918)
    dest = (37.15388676231725, 126.92016611584512)

    cands = rg.load_candidates(con, region, price_date=PRICE_DATE)
    baseline = rg.baseline_for(con, region, price_date=PRICE_DATE)
    provider = rg.StraightLineRoute(road_factor=1.3)
    dec = rg.decide(cands, origin, dest, baseline, provider)
    assert dec.verdict == "stay", f"시나리오가 바뀌었습니다: {dec.verdict}"

    pick = dec.pick
    runner = dec.runner_up
    v = vd.judge(con, pick.station_id, price_date=PRICE_DATE)
    is_self, addr = con.execute(
        "SELECT is_self, addr FROM stations WHERE station_id=?", (pick.station_id,)
    ).fetchone()
    inside = rg.corridor_filter(cands, origin, dest)
    prices = sorted(c.price for c in inside)

    ph = fa.today_phase(con, as_of=PRICE_DATE)
    ev = fa.upcoming_event(TODAY)
    advice = fa.recommend(vehicle="일반", phase=ph, event=ev)

    t_pick = route_t((pick.lat, pick.lng), origin, dest)
    x_pick = 22 + t_pick * (304 - 22)
    pick_name = display_name(pick.name)
    pick_anchor, pick_label_x = svg_label_anchor(x_pick)

    t_runner = route_t((runner.lat, runner.lng), origin, dest) if runner else 0.5
    x_runner = 22 + t_runner * (304 - 22)
    y_runner_off = min(24, 14 + (runner.perp_km if runner else 0) * 8)
    y_runner_dot = 52 - y_runner_off - 6
    runner_name = display_name(runner.name) if runner else ""
    # 라벨은 원 옆에 나란히. 오른쪽 공간이 없으면 왼쪽으로 뒤집는다.
    if x_runner > 180:
        runner_anchor, runner_label_x = "end", x_runner - 13
    else:
        runner_anchor, runner_label_x = "start", x_runner + 13

    net = runner.gain if runner else 0.0

    def fmt_dist(km):
        return f"{km:.1f}km" if km >= 1.0 else f"{km*1000:.0f}m"

    badge = CHARACTER_BADGE.get(v.character, v.character or "")
    self_badge = '<span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; border: 1px solid #DDE3E1; color: #4A5558;">셀프</span>' if is_self else ""

    body = top_bar("현위치", "집")
    body += f"""
  <div style="padding: 14px 16px 0; display: flex; flex-direction: column; gap: 11px; flex-grow: 1;">

    <div style="background: #FFFFFF; border: 1px solid #0B6B60; border-radius: 16px; box-shadow: 0 0 0 3px #E2F1EE; padding: 18px 16px 16px; display: flex; flex-direction: column;">
      <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #0A5850;">돌아갈 필요 없습니다</span>
      <h1 style="margin: 6px 0 0; font-family: 'Gothic A1', sans-serif; font-size: {title_font_px(pick_name, 24)}px; font-weight: 900; letter-spacing: -0.025em; color: #13181A; line-height: 1.28;">가는 길 {esc(pick_name)}에서<br>그냥 넣으세요</h1>
      <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
        <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; border: 1px solid #DDE3E1; color: #4A5558;">{esc(pick.brand)}</span>
        {self_badge}
        <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: #E4F2E8; color: #0F5628;">{esc(badge)}</span>
      </div>

      <p style="margin: 12px 0 0; font-size: 13.5px; line-height: 1.6; color: #4A5558;">
        {esc(dec.reason)}
      </p>

      <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid #E9EEEC;">
        <svg viewBox="0 0 326 112" style="display: block; width: 100%; height: auto;" role="img" aria-label="경로 도식. 추천 주유소는 가는 길 위에 있고, 대안 주유소는 벗어나 있습니다.">
          <line x1="22" y1="52" x2="304" y2="52" stroke="#C6D0CD" stroke-width="7" stroke-linecap="round"></line>
          <line x1="22" y1="52" x2="304" y2="52" stroke="#7C888B" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 7"></line>

          <circle cx="22" cy="52" r="6" fill="#13181A"></circle>
          <circle cx="304" cy="52" r="6" fill="none" stroke="#13181A" stroke-width="2.5"></circle>
          <text x="14" y="70" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">현위치</text>
          <text x="312" y="70" text-anchor="end" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">목적지</text>
"""
    if runner:
        body += f"""
          <line x1="{x_runner:.0f}" y1="52" x2="{x_runner:.0f}" y2="{y_runner_dot+6:.0f}" stroke="#B9C4C1" stroke-width="1.5" stroke-dasharray="3 4"></line>
          <circle cx="{x_runner:.0f}" cy="{y_runner_dot:.0f}" r="6" fill="none" stroke="#7C888B" stroke-width="2"></circle>
          <text x="{runner_label_x:.0f}" y="{y_runner_dot-3:.0f}" text-anchor="{runner_anchor}" font-size="11.5" font-weight="600" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">{esc(runner_name)} {runner.price:,.0f}원</text>
          <text x="{runner_label_x:.0f}" y="{y_runner_dot+11:.0f}" text-anchor="{runner_anchor}" font-size="11" fill="#7C888B" font-family="IBM Plex Sans KR, sans-serif">{fmt_dist(runner.detour_km)} 밖 · {runner.gain:+,.0f}원</text>
"""
    body += f"""
          <circle cx="{x_pick:.0f}" cy="52" r="7" fill="#0B6B60"></circle>
          <circle cx="{x_pick:.0f}" cy="52" r="11" fill="none" stroke="#0B6B60" stroke-width="1.5" opacity="0.35"></circle>
          <text x="{pick_label_x:.0f}" y="93" text-anchor="{pick_anchor}" font-size="12" font-weight="700" fill="#0A5850" font-family="IBM Plex Sans KR, sans-serif">{esc(pick_name)} · {pick.price:,.0f}원</text>
          <text x="{pick_label_x:.0f}" y="106" text-anchor="{pick_anchor}" font-size="11" fill="#5B666A" font-family="IBM Plex Sans KR, sans-serif">가는 길 위 · 우회 0m</text>
        </svg>
      </div>

      <div style="margin-top: 14px; border: 1px solid #E9EEEC; border-radius: 11px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">이 경로 주유소</span><span style="font-weight: 600; color: #13181A;">{len(inside)}곳</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">가격 폭</span><span style="font-weight: 600; color: #13181A;">{prices[0]:,.0f} ~ {prices[-1]:,.0f}원</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12.5px; background: #F5F7F6;">
          <span style="color: #5B666A;">돌아가서 남는 돈</span><span style="font-weight: 700; color: #A54A04;">{net:+,.0f}원 (수고 대비 부족)</span>
        </div>
      </div>
    </div>

    {ad_slot()}

    {fill_amount_card(advice, ph, ev)}

    <a href="#navi" style="padding: 13px 0; border-radius: 12px; background: #0B6B60; color: #FFFFFF; font-size: 13.5px; font-weight: 700; text-align: center;">{esc(pick_name)} 길찾기</a>

    {area_link(region)}
  </div>
"""
    body += footer(region, PRICE_DATE, len(inside))
    return page_shell(f"{pick_name} · 그냥 넣으세요 - 주유소찾기", "#0A5850", body, active="/",
                      description=f"{region} 가는 길 {pick_name}에서 그냥 넣으세요. 더 싼 곳까지 돌아가도 실익이 없습니다.")


def main():
    import sqlite3
    con = sqlite3.connect(DB)
    try:
        detour_html = build_detour_screen(con)
        stay_html = build_stay_screen(con)
    finally:
        con.close()

    p1 = os.path.join(OUT_DIR, "screen_24_detour.html")
    p2 = os.path.join(OUT_DIR, "screen_76_stay.html")
    with open(p1, "w", encoding="utf-8") as f:
        f.write(detour_html)
    with open(p2, "w", encoding="utf-8") as f:
        f.write(stay_html)
    print(f"작성됨: {p1}")
    print(f"작성됨: {p2}")


if __name__ == "__main__":
    main()
