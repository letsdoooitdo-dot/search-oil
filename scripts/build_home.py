#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
홈(/) + 검색엔진용 파일
========================
  index.html    사이트 입구
  sitemap.xml   242페이지를 구글에 알려준다 (롱테일 전략의 생명줄)
  robots.txt    크롤러 안내 + 사이트맵 위치
  ads.txt       애드센스 수익 보호. 없으면 일부 광고 수요가 차단된다

사이트 주소는 SITE_URL 하나만 바꾸면 전부 따라간다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import glob
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import figures
from ui import esc, ad_slot, page_shell, ADSENSE_CLIENT, url

SITE_URL = os.environ.get("SITE_URL", "https://oil.letsdoooit.com").rstrip("/")
ACCENT = "#A54A04"
INK = "#13181A"

SECTIONS = [
    ("/area/", "우리 동네 기름값", "전국 227개 시군구 · 우리 동네는 고를 가치가 있는지"),
    ("/data/", "기름값 리포트", "요일 속설·브랜드·셀프 차이를 1년 실측으로 검증"),
    ("/calc/", "계산기", "연간 주유비 · 경차 환급 · 우회 손익분기"),
    ("/policy/", "지원금·제도", "유류세 인하 종료, 경차 유류세 환급"),
]


def build_index(s):
    gas, sf = s["gas"], s["self_full"]
    cheap, pricey = s["region_cheap"], s["region_pricey"]
    top = s["regions"][0]

    cards = "".join(f"""
      <a href="{url(href)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:15px 16px;{'border-top:1px solid #E9EEEC;' if i else ''}">
        <span style="min-width:0;">
          <span style="display:block;font-size:14.5px;font-weight:700;color:{INK};">{esc(t)}</span>
          <span style="display:block;font-size:12px;color:#5B666A;margin-top:4px;line-height:1.55;">{esc(d)}</span>
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" style="flex-shrink:0;" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
      </a>""" for i, (href, t, d) in enumerate(SECTIONS))

    inner = f"""
  <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:12px;flex-grow:1;">

    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{ACCENT};">전국 주유소 {gas['n']:,}곳 실제 판매가</div>
      <h1 style="margin:5px 0 0;font-family:'Gothic A1',sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.025em;color:{INK};line-height:1.3;">가는 길에서 진짜 이득인<br>주유소 한 곳만 알려드립니다</h1>
      <p style="margin:10px 0 0;font-size:13.5px;line-height:1.7;color:#4A5558;">
        최저가 목록을 늘어놓지 않습니다. 출발지와 목적지를 알면
        <b style="color:{INK};">돌아갈 가치가 있는지</b>까지 계산해서, 없으면 그냥 넣으라고 말합니다.
      </p>
    </div>

    <!-- 추석 연휴 임시 띠. 블로그·쓰레드에서 명단 보러 오는 사람이 첫 화면에서
         바로 받게 한다. 9/28 이후에는 이 블록을 지운다. -->
    <a href="{url('/chuseok/')}" style="display:flex;justify-content:space-between;align-items:center;
       gap:10px;background:#8A3D03;border-radius:14px;padding:13px 14px;">
      <span>
        <span style="display:block;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#FFC98A;">추석 연휴 한정 · 9월 27일까지</span>
        <span style="display:block;font-size:14px;font-weight:800;color:#FFFFFF;margin-top:3px;">100원 내린 고속도로 주유소 205곳</span>
        <span style="display:block;font-size:11.5px;color:#F3D3B4;margin-top:3px;">명단 보기 · 엑셀로 내려받기</span>
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"
           stroke-linecap="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"></path></svg>
    </a>

    <div style="background:#FFFFFF;border:1px solid #DDE3E1;border-radius:16px;padding:16px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#5B666A;">오늘 전국 휘발유</div>
      <div style="display:flex;align-items:baseline;gap:9px;margin-top:5px;">
        <span style="font-family:'Gothic A1',sans-serif;font-size:34px;font-weight:900;letter-spacing:-0.03em;color:{ACCENT};line-height:1;">{gas['median']:,.0f}원</span>
        <span style="font-size:12.5px;color:#5B666A;">중앙값</span>
      </div>
      <div style="margin-top:13px;border:1px solid #E9EEEC;border-radius:11px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:9px 12px;font-size:12.5px;border-bottom:1px solid #E9EEEC;">
          <span style="color:#5B666A;">가장 싼 곳 ~ 비싼 곳</span><span style="font-weight:600;color:{INK};">{gas['low']:,.0f} ~ {gas['high']:,.0f}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 12px;font-size:12.5px;border-bottom:1px solid #E9EEEC;">
          <span style="color:#5B666A;">셀프 / 일반</span><span style="font-weight:600;color:{INK};">{sf['self']['median']:,.0f} / {sf['full']['median']:,.0f}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 12px;font-size:12.5px;background:#F5F7F6;">
          <span style="color:#5B666A;">동네 안 최대 격차</span><span style="font-weight:700;color:{ACCENT};">{top['region']} {top['spread']:,.0f}원</span>
        </div>
      </div>
    </div>

    {ad_slot()}

    <div>
      <div style="font-family:'Gothic A1',sans-serif;font-size:17px;font-weight:900;color:{INK};margin-bottom:9px;">이런 답을 드립니다</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <a href="{url('/screen_24_detour.html')}" style="background:#FFFFFF;border:1px solid #D96206;border-radius:14px;padding:13px;">
          <span style="display:block;font-size:11px;font-weight:700;color:#A54A04;">24%</span>
          <span style="display:block;font-size:13.5px;font-weight:800;color:{INK};margin-top:3px;">돌아가세요</span>
          <span style="display:block;font-size:11.5px;color:#5B666A;margin-top:4px;line-height:1.5;">벗어나도 남는 게 있을 때</span>
        </a>
        <a href="{url('/screen_76_stay.html')}" style="background:#FFFFFF;border:1px solid #0B6B60;border-radius:14px;padding:13px;">
          <span style="display:block;font-size:11px;font-weight:700;color:#0A5850;">76%</span>
          <span style="display:block;font-size:13.5px;font-weight:800;color:{INK};margin-top:3px;">그냥 넣으세요</span>
          <span style="display:block;font-size:11.5px;color:#5B666A;margin-top:4px;line-height:1.5;">돌아갈 가치가 없을 때</span>
        </a>
      </div>
      <p style="margin:9px 0 0;font-size:11.5px;color:#6B7679;line-height:1.6;">
        실측 3,000건 중 76%는 "그냥 넣으세요"였습니다. 돌아갈 필요가 없다는 걸 말해주는 서비스가 없을 뿐입니다.
      </p>
    </div>

    <div style="background:#FFFFFF;border:1px solid #DDE3E1;border-radius:16px;overflow:hidden;">
      {cards}
    </div>

    <div style="background:{INK};border-radius:16px;padding:17px 16px;">
      <p style="margin:0;font-size:13.5px;line-height:1.7;color:#FFFFFF;font-weight:600;">
        오늘 가장 싼 동네는 {esc(cheap['region'])} {cheap['median']:,.0f}원,
        가장 비싼 동네는 {esc(pricey['region'])} {pricey['median']:,.0f}원입니다.
      </p>
      <p style="margin:8px 0 0;font-size:12.5px;line-height:1.65;color:#C6D0CD;">
        사는 동네는 못 바꿔도, 가는 길에 있는 싼 곳은 고를 수 있습니다.
      </p>
    </div>
  </div>

  <div style="padding:12px 16px 18px;">
    <p style="margin:0;font-size:11px;color:#5B666A;line-height:1.6;">
      {s['date'][:4]}년 {int(s['date'][5:7])}월 {int(s['date'][8:10])}일 실제 판매가 · 출처 오피넷 · 매일 갱신
    </p>
  </div>
"""
    return page_shell("주유소찾기 - 가는 길에서 진짜 이득인 주유소", ACCENT, inner, active="/",
                      description=f"전국 주유소 {gas['n']:,}곳 실제 판매가. 가는 길에서 돌아갈 "
                                  f"가치가 있는 주유소만 알려드립니다. 오늘 전국 중앙값 {gas['median']:,.0f}원.")


def site_pages():
    """사이트맵에 넣을 경로 목록."""
    out = ["/"]
    for f in ("screen_24_detour.html", "screen_76_stay.html"):
        if os.path.exists(os.path.join(ROOT, f)):
            out.append("/" + f)
    for d in ("area", "data", "calc", "policy"):
        for p in sorted(glob.glob(os.path.join(ROOT, d, "*.html"))):
            name = os.path.basename(p)
            out.append(f"/{d}/" if name == "index.html" else f"/{d}/{name}")
    return out


def build_sitemap(paths, today):
    import urllib.parse
    urls = "".join(
        f"\n  <url><loc>{SITE_URL}{urllib.parse.quote(p)}</loc>"
        f"<lastmod>{today}</lastmod>"
        f"<changefreq>daily</changefreq>"
        f"<priority>{'1.0' if p == '/' else ('0.8' if p.endswith('/') else '0.6')}</priority></url>"
        for p in paths)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f"{urls}\n</urlset>\n")


def main():
    s = figures.snapshot()
    today = date.today().isoformat()

    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_index(s))

    paths = site_pages()
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(build_sitemap(paths, today))

    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n")

    # 애드센스 수익 보호용. 없으면 일부 광고 수요가 입찰하지 않는다.
    pub = ADSENSE_CLIENT.replace("ca-", "")
    with open(os.path.join(ROOT, "ads.txt"), "w", encoding="utf-8") as f:
        f.write(f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n")

    # GitHub Pages 가 _ 로 시작하는 경로를 Jekyll 로 처리하지 않도록
    open(os.path.join(ROOT, ".nojekyll"), "w").close()

    print(f"홈 + sitemap({len(paths)}개 주소) + robots + ads.txt 작성")
    print(f"사이트 주소: {SITE_URL}")


if __name__ == "__main__":
    main()
