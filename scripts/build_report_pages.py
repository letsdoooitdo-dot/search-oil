#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기름값 리포트 (/data/)
======================
속설 검증 시리즈. 검색량은 있는데 아무도 데이터로 답하지 못하는 주제를
1년 실측으로 답한다. 공유·백링크로 유입을 만드는 것이 이 탭의 역할이다.

차트 원칙
  * 우리 가격은 전부 1,800원대라 0부터 그린 막대는 전부 똑같아 보인다.
    그래서 절대가격이 아니라 '기준점 대비 차이'를 그린다 (축을 자르지 않는다).
  * 한 계열 = 한 색. 막대 길이를 색으로 이중 인코딩하지 않는다.
  * 모든 차트에 표(table view)를 같이 둔다 - 색만으로 읽히는 정보가 없도록.
  * 차트 색은 dataviz 검증기 통과값: #D96206 / #0E9C86 (CVD ΔE 13.9, 대비 3:1 이상).

표준 라이브러리만 사용.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ui import esc, ad_slot, page_shell, url

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
ACCENT = "#A54A04"
S1 = "#D96206"          # 계열 1
S2 = "#0E9C86"          # 계열 2 (검증 통과 스텝)
INK = "#13181A"
MUTED = "#6B7679"
HAIRLINE = "#E1E0D9"
import figures

# 기준일은 박아두지 않는다. 새 가격이 들어오면 페이지도 따라 바뀌어야 한다.
PRICE_DATE = figures.latest_price_date()


# ── 차트 ───────────────────────────────────────────────────────────────────
def hbar(rows, unit, color=S1, width=326, bar_h=20, gap=10, label_w=96, aria=""):
    """가로 막대. rows = [(label, value, emphasized)]

    값 라벨을 막대 끝에 직접 붙이고 x축 눈금은 없앤다 - 모바일에서 축보다 읽기 쉽다.
    라벨이 길면(8자 초과) 왼쪽에서 잘리므로 막대 위로 올린다.
    """
    above = max(len(l) for l, _, _ in rows) > 8
    vmax = max(v for _, v, _ in rows) or 1
    row_h = (bar_h + 16 + gap) if above else (bar_h + gap)
    left = 0 if above else label_w
    plot_w = width - left - 46
    height = len(rows) * row_h + 6
    parts = []
    for i, (label, value, emph) in enumerate(rows):
        top = i * row_h + 3
        y = top + 16 if above else top
        w = max(2.0, value / vmax * plot_w)
        fill = color if emph else "#C6D0CD"
        ink = INK if emph else MUTED
        if value == 0:
            # 기준점 행. 0짜리 막대는 '데이터 없음'으로 오독되므로 막대 없이 글자로 표시한다.
            parts.append(
                (f'<text x="0" y="{top + 11}" font-size="11.5" fill="{INK}" font-weight="600">{esc(label)}</text>'
                 if above else
                 f'<text x="{left - 8}" y="{y + bar_h/2 + 4:.0f}" text-anchor="end" font-size="11.5" '
                 f'fill="{INK}" font-weight="600">{esc(label)}</text>')
                + f'<text x="{left + 2}" y="{y + bar_h/2 + 4:.0f}" font-size="11.5" fill="{MUTED}">기준</text>'
            )
            continue
        if above:
            parts.append(f'<text x="0" y="{top + 11}" font-size="11.5" fill="{ink}" '
                         f'font-weight="{600 if emph else 400}">{esc(label)}</text>')
        else:
            parts.append(f'<text x="{left - 8}" y="{y + bar_h/2 + 4:.0f}" text-anchor="end" font-size="11.5" '
                         f'fill="{ink}" font-weight="{600 if emph else 400}">{esc(label)}</text>')
        parts.append(
            f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar_h}" rx="4" fill="{fill}">'
            f'<title>{esc(label)}: {value:,.1f}{unit}</title></rect>'
            f'<text x="{left + w + 7:.1f}" y="{y + bar_h/2 + 4:.0f}" font-size="11.5" '
            f'fill="{ink}" font-weight="{700 if emph else 500}">{value:,.1f}{unit}</text>'
        )
    rule = ("" if above else
            f'<line x1="{left}" y1="0" x2="{left}" y2="{height-6}" stroke="{HAIRLINE}" stroke-width="1"></line>')
    return (f'<svg viewBox="0 0 {width} {height}" style="display:block;width:100%;height:auto;" '
            f'role="img" aria-label="{esc(aria)}" font-family="IBM Plex Sans KR, sans-serif">'
            + rule + "".join(parts) + "</svg>")


def table(headers, rows, note=""):
    """차트의 표 쌍둥이. 색 없이도 모든 값을 읽을 수 있어야 한다."""
    head = "".join(f'<th scope="col" style="text-align:{"left" if i == 0 else "right"};padding:8px 10px;'
                   f'font-size:11.5px;font-weight:600;color:{MUTED};border-bottom:1px solid {HAIRLINE};">{esc(h)}</th>'
                   for i, h in enumerate(headers))
    body = ""
    for r in rows:
        tds = "".join(f'<td style="text-align:{"left" if i == 0 else "right"};padding:8px 10px;font-size:12px;'
                      f'color:{INK};border-bottom:1px solid #F0EFEC;'
                      f'{"font-variant-numeric:tabular-nums;" if i else ""}">{esc(c)}</td>'
                      for i, c in enumerate(r))
        body += f"<tr>{tds}</tr>"
    n = (f'<p style="margin:9px 0 0;font-size:11px;color:{MUTED};line-height:1.55;">{esc(note)}</p>'
         if note else "")
    return (f'<table style="width:100%;border-collapse:collapse;margin-top:4px;">'
            f'<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>{n}')


# ── 페이지 조각 ────────────────────────────────────────────────────────────
def article_head(kicker, title, lead):
    return f"""
    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">{esc(kicker)}</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900; letter-spacing: -0.025em; color: {INK}; line-height: 1.32;">{title}</h1>
      <p style="margin: 10px 0 0; font-size: 13.5px; line-height: 1.7; color: #4A5558;">{lead}</p>
    </div>"""


def card(title, inner):
    t = (f'<div style="font-family: \'Gothic A1\', sans-serif; font-size: 17px; font-weight: 900; color: {INK}; margin-bottom: 10px;">{esc(title)}</div>'
         if title else "")
    return f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      {t}{inner}
    </div>"""


def para(*texts):
    return "".join(
        f'<p style="margin: 0 0 11px; font-size: 13.5px; line-height: 1.75; color: #4A5558;">{t}</p>'
        for t in texts)


def punchline(text):
    return f"""
    <div style="background: {INK}; border-radius: 16px; padding: 17px 16px;">
      <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #FFFFFF; font-weight: 600;">{text}</p>
    </div>"""


def back_links():
    return f"""
    <a href="{url('/')}" style="display: flex; justify-content: space-between; align-items: center; background: #13181A; border-radius: 14px; padding: 14px;">
      <span style="font-size: 13px; font-weight: 700; color: #FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>
    <a href="{url('/data/')}" style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 14px; padding: 12px 14px;">
      <span style="font-size: 12.5px; color: #4A5558;">다른 리포트 보기</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""


def source_note(extra=""):
    return f"""
  <div style="padding: 12px 16px 18px;">
    <p style="margin: 0; font-size: 11px; color: #5B666A; line-height: 1.6;">
      출처 오피넷 · 전국 주유소 10,298곳 · 오늘 가격은 {PRICE_DATE[:4]}년 {int(PRICE_DATE[5:7])}월 {int(PRICE_DATE[8:10])}일 실제 판매가,
      1년 통계는 최근 1년 일별 가격 기준{(' · ' + extra) if extra else ''}
    </p>
  </div>"""


def wrap(inner):
    return f"""
  <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 12px; flex-grow: 1;">
{inner}
  </div>"""


# ── 1. 요일 속설 ───────────────────────────────────────────────────────────
def build_weekday():
    rows = [("일요일", 0.0, False), ("월요일", 0.5, False), ("화요일", 0.7, False),
            ("수요일", 1.6, False), ("목요일", 2.3, False), ("금요일", 3.1, False),
            ("토요일", 3.9, True)]
    chart1 = hbar(rows, "원", aria="요일별 평균 가격 차이. 가장 싼 일요일 대비 가장 비싼 토요일이 3.9원 높습니다.")
    tbl1 = table(["요일", "1년 평균", "최저 요일 대비"],
                 [("일요일", "1,812.6원", "기준"), ("월요일", "1,813.2원", "+0.5원"),
                  ("화요일", "1,813.4원", "+0.7원"), ("수요일", "1,814.2원", "+1.6원"),
                  ("목요일", "1,814.9원", "+2.3원"), ("금요일", "1,815.8원", "+3.1원"),
                  ("토요일", "1,816.5원", "+3.9원")],
                 note="요일별 53일씩, 총 371일 전국 중앙가 평균")

    rows2 = [("요일 고르기", 3.9, False), ("상승장에서 일주일 미루기", 21.0, False),
             ("셀프 주유소 고르기", 39.0, False), ("가장 싼 동네 vs 비싼 동네", 303.0, True)]
    chart2 = hbar(rows2, "원", label_w=120,
                  aria="리터당 차이 비교. 요일 3.9원, 국면 21원, 셀프 39원, 지역 303원.")
    tbl2 = table(["무엇을 바꾸나", "리터당 차이", "50L 기준"],
                 [("요일 고르기", "3.9원", "195원"), ("상승장에서 일주일 미루기", "21.0원", "1,050원"),
                  ("셀프 주유소 고르기", "39.0원", "1,950원"), ("가장 싼 동네 vs 비싼 동네", "303.0원", "15,150원")])

    inner = article_head(
        "기름값 리포트",
        '"화요일에 넣으면 싸다"는<br>진짜일까',
        "주유 커뮤니티에서 오래 도는 이야기입니다. 화요일이 싸다, 주말은 비싸다. "
        "1년치 전국 가격을 전부 확인해봤습니다.")

    inner += card("결론부터: 요일 차이는 3.9원입니다", chart1 + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        가장 싼 요일은 <b style="color:{INK};">일요일</b>, 가장 비싼 요일은 <b style="color:{INK};">토요일</b>이고
        그 차이가 <b style="color:{INK};">리터당 3.9원</b>입니다. 50L를 넣어도 <b style="color:{INK};">195원</b> 차이입니다.
        캔커피 한 잔이 안 됩니다.
      </p>""" + f'<div style="margin-top:14px;">{tbl1}</div>')

    inner += para(
        "흥미롭게도 화요일이 특별히 싸지도 않았습니다. 화요일은 일요일보다 0.7원 비쌌고, "
        "순서로 보면 세 번째로 싼 요일이었습니다. "
        "속설의 방향 자체는 틀리지 않았지만 — 주중이 주말보다 싸긴 합니다 — 그 크기가 의미 없는 수준입니다.")

    inner += ad_slot()

    inner += card("그럼 뭐가 중요한가", chart2 + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        같은 1년 데이터로 다른 변수들을 재봤습니다. 요일이 3.9원일 때
        <b style="color:{INK};">어느 동네에서 넣느냐는 303원</b>입니다. 약 78배입니다.
      </p>""" + f'<div style="margin-top:14px;">{tbl2}</div>')

    inner += para(
        "두 번째로 큰 건 <b>타이밍</b>입니다. 다만 요일이 아니라 <b>국면</b>입니다. "
        "가격이 오르는 구간에서 주유를 일주일 미루면 평균 21원을 더 냈고, "
        "이 일은 10번 중 7~8번(75%) 일어났습니다. 반대로 내리는 구간에서 일주일 기다려봐야 "
        "평균 2.1원밖에 못 아꼈습니다. <b>오를 때 미루면 확실히 손해, 내릴 때 기다려봐야 별 이득 없음</b>입니다.")

    inner += punchline(
        "요일을 고르느라 쓴 시간은 리터당 4원짜리입니다. "
        "같은 시간에 가는 길의 싼 주유소를 고르면 그 수십 배가 남습니다.")

    inner += card("", para(
        "이 사이트는 출발지와 목적지를 넣으면 <b>가는 길에서 벗어나지 않으면서 가장 이득인 주유소 한 곳</b>을 찍어줍니다. "
        "돌아갈 가치가 없으면 그냥 넣으라고 말합니다."))

    inner += back_links()
    body = wrap(inner) + source_note("국면은 전국 중앙가의 주간 추세로 상승·하락·횡보를 분류")
    return page_shell('"화요일에 넣으면 싸다"는 진짜일까 - 1년 데이터로 확인한 요일별 기름값',
                      ACCENT, body, active="/data/",
                      description="주유 요일 속설을 1년치 전국 가격으로 검증했습니다. "
                                  "요일별 차이는 3.9원. 정작 중요한 건 따로 있었습니다.")


# ── 2. 브랜드 ──────────────────────────────────────────────────────────────
def build_brand():
    rows = [("알뜰주유소", 0, False), ("HD현대오일뱅크", 16, False), ("SK에너지", 19, False),
            ("알뜰(고속도로)", 23, False), ("GS칼텍스", 25, False), ("S-OIL", 26, False),
            ("NH-OIL(농협)", 30, True)]
    chart = hbar(rows, "원", label_w=110,
                 aria="셀프 주유소끼리 비교한 브랜드별 가격. 알뜰이 가장 싸고 농협이 30원 비쌉니다.")
    tbl = table(["브랜드", "셀프 중앙값", "알뜰 대비"],
                [("알뜰주유소", "1,819원", "기준"), ("HD현대오일뱅크", "1,835원", "+16원"),
                 ("SK에너지", "1,838원", "+19원"), ("알뜰(고속도로)", "1,842원", "+23원"),
                 ("GS칼텍스", "1,844원", "+25원"), ("S-OIL", "1,845원", "+26원"),
                 ("NH-OIL(농협)", "1,849원", "+30원")],
                note="셀프 주유소 50곳 이상인 브랜드만. 셀프끼리 비교해 셀프 효과를 제거했습니다.")

    self_rows = [("HD현대오일뱅크", 43, False), ("SK에너지", 40, False), ("GS칼텍스", 40, False),
                 ("S-OIL", 34, False), ("알뜰주유소", 22, False), ("NH-OIL(농협)", 20, False)]
    chart2 = hbar(self_rows, "원", color=S2, label_w=110,
                  aria="같은 브랜드 안에서 셀프가 일반보다 싼 폭. 20원에서 43원.")

    inner = article_head(
        "기름값 리포트",
        "SK·GS·현대·S-OIL<br>어디가 제일 쌀까",
        "전국 10,298곳 중 오늘 휘발유를 파는 10,161곳을 전부 비교했습니다. "
        "결론은 조금 허무하고, 진짜 변수는 따로 있었습니다.")

    inner += card("4대 정유사 차이는 10원입니다", chart + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        셀프 주유소끼리만 비교하면 현대 1,835원 · SK 1,838원 · GS 1,844원 · S-OIL 1,845원으로,
        가장 싼 곳과 가장 비싼 곳의 차이가 <b style="color:{INK};">10원</b>입니다.
        브랜드를 보고 고르는 것은 거의 의미가 없습니다.
      </p>""" + f'<div style="margin-top:14px;">{tbl}</div>')

    inner += para(
        "여기서 한 가지를 짚고 넘어가야 합니다. 단순히 브랜드별 평균만 내면 "
        "알뜰주유소가 4사보다 32원 싸게 나옵니다. 그런데 <b>알뜰은 셀프 비율이 87%</b>입니다. "
        "SK는 59%, GS는 64%죠. 셀프가 원래 싼데 알뜰에 셀프가 몰려 있으니, "
        "그 차이가 알뜰 덕분인지 셀프 덕분인지 알 수 없습니다.")

    inner += para(
        "그래서 <b>셀프끼리만</b> 비교했습니다. 그랬더니 알뜰은 여전히 4사보다 "
        "<b>16~26원</b> 쌌습니다. 알뜰이 싼 건 진짜입니다.")

    inner += ad_slot()

    inner += card("브랜드보다 4배 중요한 것", chart2 + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        같은 브랜드 안에서 셀프와 일반을 비교하면 <b style="color:{INK};">20~43원</b> 차이가 납니다.
        브랜드를 고르는 것(10원)보다 <b style="color:{INK};">셀프를 고르는 것이 4배 크다</b>는 뜻입니다.
      </p>""")

    inner += para(
        "의외의 결과도 있었습니다. <b>NH-OIL(농협) 주유소가 전 브랜드 중 가장 비쌌습니다.</b> "
        "셀프 기준 1,849원으로 알뜰보다 30원, 현대보다 14원 높았습니다. "
        "농협 주유소는 셀프 비율이 33%로 유독 낮은데, 그걸 감안해 셀프끼리 비교해도 가장 비싼 축이었습니다.")

    inner += punchline(
        "브랜드를 보고 고르지 마세요. 셀프인지 보고, 알뜰이 가는 길에 있는지 보세요. "
        "그게 브랜드보다 몇 배 큽니다.")

    inner += back_links()
    body = wrap(inner) + source_note()
    return page_shell("정유사별 기름값 비교 - 1만 곳 실측, 4사 차이는 10원이었습니다",
                      ACCENT, body, active="/data/",
                      description="SK·GS·HD현대·S-OIL·알뜰·농협 주유소 1만 곳 가격을 실측 비교. "
                                  "셀프 효과를 제거하고 브랜드 순수 차이를 계산했습니다.")


# ── 3. 셀프 ────────────────────────────────────────────────────────────────
def build_self():
    rows = [("HD현대오일뱅크", 43, True), ("SK에너지", 40, False), ("GS칼텍스", 40, False),
            ("S-OIL", 34, False), ("알뜰주유소", 22, False), ("NH-OIL(농협)", 20, False)]
    chart = hbar(rows, "원", color=S2, label_w=110,
                 aria="브랜드별 셀프와 일반의 가격 차이. 20원에서 43원.")
    tbl = table(["브랜드", "셀프", "일반", "차이"],
                [("HD현대오일뱅크", "1,835원", "1,878원", "43원"),
                 ("SK에너지", "1,838원", "1,878원", "40원"),
                 ("GS칼텍스", "1,844원", "1,884원", "40원"),
                 ("S-OIL", "1,845원", "1,879원", "34원"),
                 ("알뜰주유소", "1,819원", "1,842원", "22원"),
                 ("NH-OIL(농협)", "1,849원", "1,869원", "20원")],
                note="셀프·일반 각 50곳 이상인 브랜드만")

    inner = article_head(
        "기름값 리포트",
        "셀프 주유소는<br>얼마나 쌀까",
        "직접 주유하는 수고의 값은 얼마일까요. 전국 1만 곳을 세어봤습니다. "
        "셀프 6,243곳, 일반 3,918곳입니다.")

    inner += card("전국 중앙값 차이는 39원입니다", f"""
      <div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-family:'Gothic A1',sans-serif;font-size:40px;font-weight:900;letter-spacing:-0.03em;color:{ACCENT};line-height:1;">39원</span>
        <span style="font-size:13px;color:#4A5558;">리터당</span>
      </div>
      <p style="margin: 11px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        셀프 <b style="color:{INK};">1,839원</b> vs 일반 <b style="color:{INK};">1,878원</b>.
        50L를 넣으면 <b style="color:{INK};">1,950원</b>, 1년에 1,200L를 넣는 운전자라면
        <b style="color:{INK};">46,800원</b> 차이입니다.
      </p>""")

    inner += para(
        "이 39원이 순수하게 '셀프라서'인지 확인하려면 브랜드를 고정해야 합니다. "
        "셀프가 많은 브랜드가 원래 싼 브랜드일 수도 있으니까요. "
        "그래서 같은 브랜드 안에서 셀프와 일반을 비교했습니다.")

    inner += card("같은 브랜드 안에서도 20~43원", chart + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        어느 브랜드를 보든 셀프가 쌉니다. 폭이 가장 큰 곳은
        <b style="color:{INK};">HD현대오일뱅크(43원)</b>, 가장 작은 곳은 농협(20원)입니다.
      </p>""" + f'<div style="margin-top:14px;">{tbl}</div>')

    inner += ad_slot()

    inner += para(
        "흥미로운 건 <b>알뜰주유소(22원)와 농협(20원)에서 폭이 작다</b>는 점입니다. "
        "두 곳은 일반 주유소도 이미 상대적으로 싸게 팔기 때문에, 셀프로 바꿔서 더 낮출 여지가 적습니다. "
        "반대로 4대 정유사는 일반 주유소 가격이 1,878~1,884원으로 높아서 셀프와의 격차가 큽니다.")

    inner += punchline(
        "직접 주유하는 3분의 값이 리터당 40원 안팎입니다. "
        "50L면 2,000원, 시급으로 환산하면 4만 원짜리 노동입니다.")

    inner += back_links()
    body = wrap(inner) + source_note()
    return page_shell("셀프 주유소는 얼마나 쌀까 - 전국 1만 곳 실측 39원",
                      ACCENT, body, active="/data/",
                      description="셀프와 일반 주유소 가격 차이를 전국 1만 곳으로 실측. "
                                  "전국 중앙값 39원, 같은 브랜드 안에서도 20~43원 차이.")


# ── 4. 지역 격차 ───────────────────────────────────────────────────────────
def build_region_gap():
    rows = [("서울 성북구", 714, True), ("서울 강남구", 700, True), ("서울 중구", 604, False),
            ("서울 서초구", 543, False), ("서울 구로구", 501, False), ("인천 미추홀구", 493, False),
            ("서울 용산구", 492, False)]
    chart = hbar(rows, "원", label_w=100,
                 aria="동네 안 최저가와 최고가의 차이가 가장 큰 시군구. 성북구 714원이 최대.")

    rows2 = [("강원 화천군", 32, True), ("경기 군포시", 37, False), ("강원 삼척시", 40, False),
             ("전북 진안군", 41, False), ("충남 청양군", 42, False)]
    chart2 = hbar(rows2, "원", color=S2, label_w=100,
                  aria="동네 안 가격 차이가 가장 작은 시군구. 화천군 32원이 최소.")

    tbl = table(["구분", "시군구 수"],
                [("격차 250원 이상 (고를 가치 큼)", "17곳"),
                 ("격차 60~250원 (보통)", "181곳"),
                 ("격차 60원 미만 (어디나 비슷)", "18곳")],
                note="주유소 10곳 이상인 216개 시군구 기준 · 격차 중앙값 131원")

    inner = article_head(
        "기름값 리포트",
        "같은 동네인데<br>714원 차이가 납니다",
        "서울 성북구에서 가장 싼 주유소는 1,835원, 가장 비싼 곳은 2,549원입니다. "
        "차로 10분 거리 안에서 벌어지는 일입니다.")

    inner += card("동네 안 격차가 가장 큰 곳", chart + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        상위 7곳 중 6곳이 서울입니다. 성북구는 50L를 넣는다면 한 번 주유에
        <b style="color:{INK};">35,700원</b>이 갈립니다.
      </p>""")

    inner += para(
        "여기서 흔한 오해 하나를 짚고 싶습니다. "
        "'서울은 기름값이 비싸다'고들 하지만, <b>서울 중앙값은 1,869원으로 전국 중앙값 1,855원보다 14원 높을 뿐</b>입니다. "
        "서울의 진짜 특징은 비싼 게 아니라 <b>편차가 크다</b>는 것입니다. "
        "어느 도시에 사느냐보다 그 도시 안에서 어디에 들어가느냐가 훨씬 큽니다.")

    inner += ad_slot()

    inner += card("반대로 어디나 똑같은 곳", chart2 + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        강원 화천군은 동네 안 차이가 <b style="color:{INK};">32원</b>뿐입니다.
        50L를 넣어도 1,600원 차이라, 제일 싼 집을 찾아 <b style="color:{INK};">10km만 더 돌아도</b>
        아낀 돈이 기름값으로 사라집니다. 이런 동네에서는 찾아다니는 것 자체가 손해입니다.
      </p>""")

    inner += card("전국은 어느 쪽이 많나", tbl + f"""
      <p style="margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: #4A5558;">
        216개 시군구의 격차 중앙값은 <b style="color:{INK};">131원</b>입니다.
        대부분의 동네는 '적당히 따져볼 만한' 구간에 있습니다.
      </p>""")

    inner += punchline(
        "우리 동네가 어느 쪽인지부터 확인하세요. "
        "격차가 큰 동네라면 고르는 게 돈이 되고, 작은 동네라면 찾아다니는 게 손해입니다.")

    inner += f"""
    <a href="{url('/area/')}" style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 14px; padding: 13px 14px;">
      <span style="font-size: 12.5px; color: #4A5558;"><b style="font-weight:700;color:#13181A;">우리 동네</b> 격차 확인하기 (227개 시군구)</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""

    inner += back_links()
    body = wrap(inner) + source_note()
    return page_shell("같은 동네인데 714원 차이 - 전국 시군구 기름값 격차",
                      ACCENT, body, active="/data/",
                      description="같은 시군구 안에서 기름값이 얼마나 벌어지는지 전국 216곳 실측. "
                                  "성북구 714원, 화천군 32원.")


# ── 목차 ──────────────────────────────────────────────────────────────────
ARTICLES = [
    ("weekday.html", '"화요일에 넣으면 싸다"는 진짜일까',
     "1년치 전국 가격으로 확인한 요일별 차이는 3.9원이었습니다"),
    ("brand.html", "SK·GS·현대·S-OIL 어디가 제일 쌀까",
     "1만 곳 실측 결과 4사 차이는 10원. 진짜 변수는 따로 있었습니다"),
    ("self.html", "셀프 주유소는 얼마나 쌀까",
     "전국 중앙값 39원, 같은 브랜드 안에서도 20~43원"),
    ("region-gap.html", "같은 동네인데 714원 차이가 납니다",
     "서울 성북구 714원, 강원 화천군 32원. 우리 동네는 어느 쪽일까요"),
]


def build_index():
    items = "".join(f"""
      <a href="{url(f"/data/{href}")}" style="display: block; padding: 15px 16px; {'border-top: 1px solid #E9EEEC;' if i else ''}">
        <span style="display: block; font-size: 14.5px; font-weight: 700; color: {INK}; line-height: 1.45;">{esc(title)}</span>
        <span style="display: block; font-size: 12px; color: #5B666A; margin-top: 5px; line-height: 1.55;">{esc(desc)}</span>
      </a>""" for i, (href, title, desc) in enumerate(ARTICLES))

    inner = article_head(
        "기름값 리포트",
        "속설을 데이터로<br>확인했습니다",
        "주유소 10,298곳의 1년치 실제 판매가로, 흔히 도는 이야기들이 맞는지 하나씩 검증합니다. "
        "일반론이 아니라 실측입니다.")
    inner += f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; overflow: hidden;">
      {items}
    </div>

    {ad_slot()}

    {back_links()}"""
    body = wrap(inner) + source_note()
    return page_shell("기름값 리포트 - 주유소찾기", ACCENT, body, active="/data/",
                      description="주유 속설을 전국 1만 곳 1년치 실제 판매가로 검증한 리포트 모음.")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pages = {
        "index.html": build_index(),
        "weekday.html": build_weekday(),
        "brand.html": build_brand(),
        "self.html": build_self(),
        "region-gap.html": build_region_gap(),
    }
    for name, html in pages.items():
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"{len(pages)} pages written to {OUT_DIR}")


if __name__ == "__main__":
    main()
