#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
블로그스팟 테마 파일 만들기
============================
실행:  python build_theme.py [데이터 주소]
  예)  python build_theme.py https://letsdoooitdo-dot.github.io/search-oil/api/

만들어지는 것
  blogger/theme-oil.xml        블로그스팟 [테마 → HTML 편집]에 붙여넣을 파일
  .theme-preview/index.html    내 컴퓨터에서 확인용 (홈)
  .theme-preview/area.html     확인용 (동네 상세)
  .theme-preview/calc.html     확인용 (계산기)

정부지원금찾기의 build-theme.mjs 와 같은 방식이다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from ui import ADSENSE_CLIENT, ADSENSE_SLOT_INCONTENT, ADSENSE_SLOT_TOP

DEFAULT_DATA_URL = "https://letsdoooitdo-dot.github.io/search-oil/api/"
# 그림은 데이터와 다른 폴더에 둔다 - api/ 는 매일 지워지고 다시 만들어진다
IMG_URL = "https://letsdoooitdo-dot.github.io/search-oil/img/"

# 광고 스위치. 개발 중에는 꺼두고, 화면·기능이 정리되면 True 로 바꾼다.
# False 면 테마의 애드센스 로더와 설정값이 모두 빠져서 자동광고까지 함께 멈춘다.
# 2026-09-23 켰다. 화면마다 자리가 잡혀 있어(adSlotHtml) 켜도 내용이 밀리지 않는다.
# 미리보기(preview.py)는 아래에서 로더와 adClient 를 따로 빼므로 그대로 광고가 없다.
ADS_ON = True

# 카카오맵 JavaScript 키 ("장소명 검색"에 쓴다).
# developers.kakao.com 에서 앱을 만들고 [앱 키] → JavaScript 키를 여기 넣는다.
# 플랫폼 > Web 에 아래 두 주소를 모두 등록해야 한다.
#   https://16story-005.letsdoooit.com     (실제 블로그)
#   http://localhost:8080                  (내 컴퓨터 미리보기 - preview.py)
# 등록한 주소 밖에서는 동작하지 않으므로 테마에 들어가도 안전하다.
KAKAO_KEY = "f0e3cf8d7eda3f38469d8ab719daed3c"

# 길찾기(실제 도로거리)용 카카오 REST 키.
# ★ 이 키는 JavaScript 키와 달리 도메인 제한을 걸 수 없다. 공개되면 남이 그대로 쓴다.
#   그래서 저장소에 넣지 않고 scripts/local_keys.py(깃 제외)에서 읽는다.
#   공개 전에는 NAVI_PROXY(중계 서버)를 채운다 - 그러면 키가 테마에 들어가지 않는다.
try:
    from local_keys import NAVI_KEY
except ImportError:
    NAVI_KEY = ""   # 키가 없으면 길찾기 없이 직선 어림값으로 돈다

# 중계 서버는 반드시 한국에서 돌아야 한다.
# Cloudflare Worker 무료 플랜은 한국 트래픽을 홍콩·도쿄에서 처리해서
# 한 건에 2~7초가 걸리고 실패도 섞였다(같은 순간 카카오 직접은 0.4초).
# Vercel 서울(icn1)로 옮기니 0.2~0.3초, 실패 0건이 됐다.
#   옛 주소: https://oil-navi.letsdoooitdo.workers.dev  (홍콩·도쿄, 느림)
NAVI_PROXY = "https://search-oil.vercel.app"

CSS_FILES = ["src/oil-shell.css", "src/oil-style.css"]
JS_FILES = ["src/oil-blogger.js", "src/oil-core.js", "src/oil-road.js",
            "src/oil-prefs.js", "src/oil-place.js", "src/oil-map.js", "src/oil-find.js",
            "src/oil-near.js", "src/oil-dest.js", "src/oil-area.js", "src/oil-calc.js",
            "src/oil-post.js"]


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def main():
    data_url = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DATA_URL).rstrip("/") + "/"

    css = "\n".join(read(p) for p in CSS_FILES)
    js = "\n".join(read(p) for p in JS_FILES)

    # 블로그스팟 테마는 XML이라 CDATA 안에 "]]>" 가 있으면 통째로 깨진다
    for name, text in (("CSS", css), ("JS", js)):
        if "]]>" in text:
            raise SystemExit(f"{name} 안에 ]]> 가 있어 테마에 넣을 수 없습니다")

    theme = (read("blogger/theme-template.xml")
             .replace("/*@@OIL_CSS@@*/", css)
             .replace("/*@@OIL_JS@@*/", js)
             .replace("@@OIL_DATA_URL@@", data_url)
             # 머리 띠·공유 이미지. ★ api/ 안에 두면 안 된다 -
             # build_data.py 가 매일 api/ 를 통째로 지우고 새로 만들어서
             # 다음 갱신 때 그림이 사라진다(2026-09-23 실제로 겪었다).
             .replace("@@OIL_IMG_URL@@", IMG_URL)
             .replace("@@OIL_AD_CLIENT@@", ADSENSE_CLIENT if ADS_ON else "")
             .replace("@@OIL_AD_SLOT_TOP@@", ADSENSE_SLOT_TOP if ADS_ON else "")
             .replace("@@OIL_AD_SLOT@@", ADSENSE_SLOT_INCONTENT if ADS_ON else "")
             .replace("@@OIL_KAKAO_KEY@@", KAKAO_KEY)
             .replace("@@OIL_NAVI_PROXY@@", NAVI_PROXY)
             # 중계 서버를 쓰면 키는 서버가 들고 있으므로 테마에 넣지 않는다
             .replace("@@OIL_NAVI_KEY@@", "" if NAVI_PROXY else NAVI_KEY))

    if NAVI_KEY and not NAVI_PROXY:
        print("  [주의] 길찾기 REST 키가 테마에 그대로 들어갑니다.")
        print("         블로그에 올리기 전에 NAVI_PROXY 를 채워주세요.")

    if not ADS_ON:
        # 애드센스 로더 자체를 빼야 자동광고(사이드 레일)도 함께 멈춘다
        theme = re.sub(r"\n\s*<script async='async'[^>]*adsbygoogle\.js[^>]*/>", "", theme)

    out = os.path.join(ROOT, "blogger", "theme-oil.xml")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(theme)

    # ── 내 컴퓨터 확인용: 블로그스팟이 테마를 HTML로 바꾸는 과정을 흉내낸다 ──
    prev_dir = os.path.join(ROOT, ".theme-preview")
    os.makedirs(prev_dir, exist_ok=True)

    body = theme
    # ★ 광고 로더는 제일 먼저 지운다. 아래에서 expr:src 를 털어내고 나면
    #   주소가 사라져 'adsbygoogle.js' 로는 더 이상 못 찾고, 빈
    #   <script async='async'/> 껍데기가 남는다. HTML 에서 <script/> 는
    #   자기가 안 닫혀서 뒤 내용을 통째로 삼키고, 미리보기 전체가 죽는다
    #   (2026-09-23 ADS_ON 을 켜자마자 실제로 그렇게 됐다).
    body = re.sub(r"<script async='async'[^>]*adsbygoogle\.js[^>]*/>", "", body)
    body = re.sub(r"<b:skin><!\[CDATA\[(.*?)\]\]></b:skin>",
                  lambda m: "<style>" + m.group(1) + "</style>", body, flags=re.S)
    body = re.sub(r"<b:section.*?</b:section>", "", body, flags=re.S)
    body = re.sub(r"<b:include[^>]*/>", "", body)
    body = body.replace("//<![CDATA[", "").replace("//]]>", "")
    body = body.replace("<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n", "")
    body = re.sub(r"\sexpr:(dir|href|src|content|id)='[^']*'", "", body)
    body = re.sub(r"<title><data:blog.pageTitle/></title>", "<title>주유소찾기</title>", body)
    body = body.replace("<html b:version='2' class='v2'", "<html lang='ko'")
    body = re.sub(r"\sxmlns:[a-z]+='[^']*'", "", body)
    # 미리보기에서는 실제 광고를 부르지 않는다 (로더는 위에서 이미 지웠다).
    # 혹시 남은 빈 껍데기가 있으면 여기서 막는다 - 하나만 남아도 화면이 죽는다.
    body = re.sub(r"<script async='async'[^>]*/>", "", body)
    body = body.replace("<script src='https://cdn.jsdelivr.net/gh/abaeksite/"
                        "aros_adsense_blocker@main/aros_adsense_blocker_v7-1.js'/>", "")
    # 테마 XML 은 따옴표를 &quot; 로 쓴다. 블로그스팟은 서빙할 때 풀어주지만
    # 미리보기는 그대로라 JS 문법 오류가 난다 - 해당 블록을 통째로 뺀다.
    body = re.sub(r"<script>\s*window\.redirectTarget[^<]*</script>", "", body, flags=re.S)
    body = body.replace("adClient: '" + ADSENSE_CLIENT + "'", "adClient: ''")
    # 미리보기는 한 폴더에 평평하게 깔린다. 화면 사이 이동이 실제로 되도록 주소를 맞춘다.
    body = (body.replace("listPageUrl: '/'", "listPageUrl: 'index.html'")
                .replace("areaPageUrl: '/p/area.html'", "areaPageUrl: 'area.html'")
                .replace("calcPageUrl: '/p/calc.html'", "calcPageUrl: 'calc.html'"))

    # 아직 올리지 않은 데이터로도 확인할 수 있게 api 폴더를 통째로 복사해 쓴다.
    # (깃허브에 올린 데이터를 보면 방금 만든 항목이 없어서 화면이 비어 보인다)
    api_src = os.path.join(ROOT, "api")
    if os.path.isdir(api_src):
        api_dst = os.path.join(prev_dir, "api")
        if os.path.isdir(api_dst):
            shutil.rmtree(api_dst)
        shutil.copytree(api_src, api_dst)
        body = body.replace("dataBaseUrl: '" + data_url + "'", "dataBaseUrl: 'api/'")
    # 미리보기에서도 그림이 보이게 img/ 를 통째로 복사한다
    img_src = os.path.join(ROOT, "img")
    if os.path.isdir(img_src):
        img_dst = os.path.join(prev_dir, "img")
        if os.path.isdir(img_dst):
            shutil.rmtree(img_dst)
        shutil.copytree(img_src, img_dst)
        body = body.replace(IMG_URL, "img/")

    for name, path in (("index.html", "/"), ("area.html", "area.html"),
                       ("calc.html", "calc.html"), ("post.html", "/2026/09/sample.html")):
        page = body.replace("location.pathname.replace(/\\/+$/, '') || '/'",
                            "'" + path + "'")
        if name == "post.html":
            # 블로그 글 화면 확인용 - 만들어둔 글 본문 하나를 끼워 넣는다
            sample = os.path.join(ROOT, "posts", "01-요일속설.html")
            if os.path.exists(sample):
                with open(sample, encoding="utf-8") as f:
                    post_body = f.read()
                page = page.replace(
                    '<div class=\'oil-blog-wrap\'>\n\n</div>',
                    '<div class=\'oil-blog-wrap\'><div class="post">'
                    '<h3 class="post-title">"화요일에 넣으면 싸다"는 진짜일까</h3>'
                    f'<div class="post-body">{post_body}</div></div></div>')
        with open(os.path.join(prev_dir, name), "w", encoding="utf-8") as f:
            f.write(page)

    print(f"테마 작성: {out}  ({os.path.getsize(out)/1024:,.0f}KB)")
    print(f"데이터 주소: {data_url}")
    print(f"미리보기: {prev_dir}\\index.html  (area.html, calc.html 도 같이 생성)")


if __name__ == "__main__":
    main()
