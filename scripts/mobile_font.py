# -*- coding: utf-8 -*-
"""휴대폰에서만 글자를 키우는 덧붙임 CSS 를 만든다 (build_theme.py 가 CSS 맨 끝에 붙인다).

2026-09-27 사용자: "폰에서 글씨가 너무 작다. PC에서 150% 확대한 정도가 좋겠다."
  - 화면 전체 확대(zoom)는 폰에서 폭이 좁아지는 효과라 탭이 넘치고 지도 누른 위치가 어긋난다.
    그래서 레이아웃은 그대로 두고 글자 크기만 키운다.
  - 작은 글자일수록 많이 키운다(휴대폰 '글자 크게' 설정과 같은 원리). 시안 '크게'로 확정.
      13px 이하 ×1.30 · 16px 이하 ×1.20 · 20px 이하 ×1.12 · 그 위 ×1.06
  - 사이트 CSS 의 font-size 규칙을 그대로 뽑아 만들므로 CSS 를 고쳐도 자동으로 따라간다.
  - ★ 반드시 사이트 CSS **뒤에** 붙인다. 앞에 두면 같은 선택자인 사이트 규칙이 이겨서 적용되지 않는다.

빼는 것
  - 상단 탭(.oil-tabs): 키우면 320px 폰에서 탭 줄이 넘친다(실측 37px). 지금 크기로 네 칸이 딱 맞는다.
  - 블로그 글(.oil-blog-wrap): 본문이 이미 16px 로 읽기용 크기다.
  - 넓은 화면용 @media 규칙: 폰에는 적용되지 않는 규칙이다.

2026-10-01 사용자: "PC 는 글씨가 너무 작아서 보기 어렵다."
  - PC(601px 이상)에도 키운다. 별도 @media 블록으로 붙인다.
  - 모니터는 폰보다 멀리서 보므로 한 단계 더 키운다(시안 3종 비교 후 '한 단계 더' 확정).
      13px 이하 ×1.40 · 16px 이하 ×1.30 · 20px 이하 ×1.18 · 그 위 ×1.10
  - PC 는 폭이 넉넉하니 상단 탭도 키운다. 블로그 글만 뺀다.
  - 넓은 화면용 @media(min-width) 규칙도 PC 에는 적용되므로 같이 키워서 뒤에 붙인다
    (안 그러면 원래 크기 규칙이 키운 규칙을 덮거나, 키운 기본 규칙이 넓은 화면 규칙을 덮는다).
"""

import re

MAX_WIDTH = 600
STEPS = [(13, 1.30), (16, 1.20), (20, 1.12), (10 ** 6, 1.06)]
PC_STEPS = [(13, 1.40), (16, 1.30), (20, 1.18), (10 ** 6, 1.10)]
SKIP = (".oil-tabs", ".oil-blog-wrap")


def factor(px, steps=STEPS):
    for limit, f in steps:
        if px <= limit:
            return f
    return 1.0


def _split_media(css):
    """@media 블록을 빼낸다 (괄호 깊이를 센다). (나머지 CSS, [(조건, 안쪽 CSS)])"""
    out, media, i = [], [], 0
    while True:
        j = css.find("@media", i)
        if j < 0:
            out.append(css[i:])
            return "".join(out), media
        out.append(css[i:j])
        b = css.find("{", j)
        k = b + 1
        depth = 1
        while depth and k < len(css):
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        media.append((css[j + 6:b].strip(), css[b + 1:k - 1]))
        i = k


def _rules(css, skip, steps=STEPS):
    rules = []
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        sel = sel.strip()
        if sel.startswith("@") or any(s in sel for s in skip):
            continue
        m = re.search(r"font-size\s*:\s*([^;]+)", body)
        if m and "px" in m.group(1):
            rules.append("%s{font-size:%s}" % (sel, _scale(m.group(1).strip(), steps)))
    return rules


def _scale(value, steps=STEPS):
    def px(m):
        n = float(m.group(1))
        return "%.2fpx" % (n * factor(n, steps))
    if value.strip().startswith("clamp"):
        # clamp(11px, 3.1vw, 12.5px) - 가운데 vw 는 최댓값 기준 배율로
        nums = [float(x) for x in re.findall(r"([\d.]+)px", value)]
        f = factor(max(nums), steps) if nums else 1.0
        value = re.sub(r"([\d.]+)vw", lambda m: "%.2fvw" % (float(m.group(1)) * f), value)
    return re.sub(r"([\d.]+)px", px, value)


def mobile_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    base, media = _split_media(css)
    phone = _rules(base, SKIP)
    # PC: 기본 규칙 + 넓은 화면용(min-width) 규칙. 탭은 PC 폭에선 넉넉해서 키운다
    pc = _rules(base, (".oil-blog-wrap",), PC_STEPS)
    for cond, inner in media:
        if "min-width" in cond and "max-width" not in cond:
            pc += _rules(inner, (".oil-blog-wrap",), PC_STEPS)
    return ("/* 글자 키우기 - scripts/mobile_font.py 가 자동으로 만든다. 직접 고치지 말 것 */\n"
            "@media (max-width:%dpx){%s}\n"
            "@media (min-width:%dpx){%s}\n"
            % (MAX_WIDTH, "\n".join(phone), MAX_WIDTH + 1, "\n".join(pc))), len(phone) + len(pc)
