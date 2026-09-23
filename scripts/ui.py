#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사이트 공통 UI 조각
====================
5개 섹션(찾기 / 우리 동네 / 리포트 / 계산기 / 지원금)이 같은 껍데기를 쓴다.
색·폰트·간격은 Design 아티팩트 「지도 UX 3안 비교」의 B안을 따른다.

표준 라이브러리만 사용.
"""

import os
import re

# GitHub Pages 프로젝트 사이트는 주소 뒤에 저장소 이름이 붙는다
# (letsdoooitdo-dot.github.io/search-oil). 그러면 "/area/" 같은 링크가 저장소 폴더를
# 건너뛰고 최상위로 가버려 전부 깨진다. 그래서 내부 링크는 전부 이 접두사를 거친다.
# 나중에 전용 도메인(oil.letsdoooit.com)을 붙이면 BASE_PATH="" 로 두면 된다.
BASE_PATH = os.environ.get("BASE_PATH", "/search-oil").rstrip("/")


def url(path: str) -> str:
    """사이트 내부 경로를 실제 주소로 바꾼다. url('/area/') -> '/search-oil/area/'"""
    if not path.startswith("/"):
        return path
    return f"{BASE_PATH}{path}" if BASE_PATH else path


FONT_LINK = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
             '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
             '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@700;800;900'
             '&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap">')

# 탭은 URL 디렉토리로 나눈다 - 구글 색인이 섹션별로 잡히고, 애드센스 노출 면적도 늘어난다.
# 로고가 홈("/") 링크를 겸하므로 "찾기" 탭은 따로 두지 않는다 (390px에 안 들어간다).
NAV = [("우리 동네", "/area/"), ("리포트", "/data/"),
       ("계산기", "/calc/"), ("지원금", "/policy/")]

# 오피넷 상호는 20.6%가 12자 이상이고 27.5%가 법인격 표기를 달고 있다.
# 사람은 "주식회사 성인석유 거창주유소"라고 부르지 않으므로 화면용 이름을 따로 만든다.
CORP_PAT = re.compile(r"㈜|\(주\)|주식회사|유한회사|\(유\)")


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def display_name(name: str) -> str:
    """화면 표시용 이름. 법인격 표기를 빼고, '법인명 + OO주유소' 구조면 지점명만 남긴다.

    마지막 토큰이 '주유소'로 끝날 때만 줄여서, '㈜한화미 구도일주유소 특종' -> '특종'
    같은 오작동을 피한다.
    """
    s = re.sub(r"\s+", " ", CORP_PAT.sub("", name)).strip()
    parts = s.split(" ")
    if len(parts) > 1 and parts[-1].endswith("주유소") and parts[-1] != "주유소":
        return parts[-1]
    return s


def title_font_px(text: str, base: int) -> int:
    """긴 상호가 들어와도 제목이 넘치지 않도록 한 단계씩 줄인다."""
    n = len(text)
    if n <= 8:
        return base
    if n <= 12:
        return base - 3
    return base - 6


def site_nav(active_href: str):
    items = []
    for label, href in NAV:
        on = (href == active_href)
        items.append(
            f'<a href="{url(href)}" style="flex-shrink: 0; padding: 11px 9px 9px; font-size: 12.5px; '
            f'font-weight: {700 if on else 500}; color: {"#13181A" if on else "#6B7679"}; '
            f'border-bottom: 2px solid {"#13181A" if on else "transparent"};">{label}</a>'
        )
    home = active_href == "/"
    return f"""
  <nav style="display: flex; align-items: center; gap: 2px; padding: 0 12px; background: #FFFFFF;
              border-bottom: 1px solid #DDE3E1;">
    <a href="{url('/')}" style="flex-shrink: 0; font-family: 'Gothic A1', sans-serif; font-size: 13.5px; font-weight: 900;
       color: #13181A; padding: 11px 12px 9px 0; letter-spacing: -0.02em;
       border-bottom: 2px solid {"#13181A" if home else "transparent"};">주유소찾기</a>
    {''.join(items)}
  </nav>"""


# 애드센스 - 정부지원금찾기와 같은 계정을 쓴다.
# 사이드 광고는 코드로 넣지 않는다. 계정의 자동광고(사이드 레일)가 처리한다.
ADSENSE_CLIENT = "ca-pub-5167405501174218"
# 광고 단위를 자리별로 나눈다(2026-09-23, 사용자가 번호를 건네줬다).
# 나누는 이유는 모양 때문이 아니다 - 둘 다 data-ad-format="auto" 라서
# '사각'·'수평'이라는 이름은 실제 모양을 정하지 않고, 애드센스가 자리 폭을
# 보고 알아서 고른다. 나누는 실익은 **수익 보고서에서 어느 자리가 돈이
# 되는지 갈라 보는 것**이다.
ADSENSE_SLOT_TOP = "6858157581"         # [수평] 화면 맨 위 - "블로그 상단 해더 광고"
ADSENSE_SLOT_INCONTENT = "3416081882"   # [수평] 내용 중간 - "블로그 중간 광고"
# 쓰지 않는 단위: 6633800886 ("최상단 고정 광고", 사각). 후보로 받았다가
# 최종안에서 빠졌다. 되살릴 일이 있으면 위의 TOP 을 이 번호로 바꾸면 된다.

ADSENSE_LOADER = (f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
                  f'?client={ADSENSE_CLIENT}" crossorigin="anonymous"></script>')


def ad_slot(slot=ADSENSE_SLOT_INCONTENT):
    """인피드 광고.

    본문 결론 바로 아래에 둔다 - 사용자가 원하는 답을 이미 얻은 직후라 저항이 가장 낮고,
    모바일 첫 화면 안에 들어와 노출도 높다. 행동 버튼과는 한 칸 이상 떨어뜨려
    오클릭 유도를 피한다(애드센스 정책).

    광고가 채워지지 않으면 ins 가 0 높이로 접히므로 빈 카드가 남지 않도록
    테두리 없이 내보낸다.
    """
    return f"""
    <div style="margin: 2px 0;">
      <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: #8A9599; margin-bottom: 6px;">광고</div>
      <ins class="adsbygoogle" style="display:block"
           data-ad-client="{ADSENSE_CLIENT}"
           data-ad-slot="{slot}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({{}});</script>
    </div>"""


def page_shell(title, accent, body_inner, active="/", description=""):
    meta_desc = (f'\n<meta name="description" content="{esc(description)}">'
                 if description else "")
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>{meta_desc}
{FONT_LINK}
{ADSENSE_LOADER}
<style>
  html,body{{margin:0;padding:0;background:#D8DCDA;font-family:"IBM Plex Sans KR",system-ui,sans-serif;}}
  a{{color:{accent};text-decoration:none}}
  a:hover{{opacity:0.85}}
  button{{font-family:inherit}}
  .frame{{width:390px;max-width:100vw;margin:24px auto;background:#EFF1F0;
          display:flex;flex-direction:column;overflow:hidden;border-radius:20px;
          box-shadow:0 12px 32px rgba(19,24,26,0.18);
          word-break:keep-all;overflow-wrap:break-word;}}
</style>
</head>
<body>
<div class="frame">
{site_nav(active)}
{body_inner}
</div>
</body>
</html>
"""
