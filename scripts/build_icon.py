# -*- coding: utf-8 -*-
"""휴대폰 홈 화면에 추가했을 때 쓰이는 아이콘을 만든다.

  img/icon-180.png   아이폰 (apple-touch-icon)
  img/icon-192.png   안드로이드 크롬
  img/icon-512.png   큰 화면·나중에 쓸 자리

디자인 (2026-09-27 사용자 결정, 시안 F3 → B3 → M1):
  검은 바탕 · "갈까"(흰색) / "말까"(코랄 레드) / 작은 "주유소찾기"(민트) · 주아 글꼴
  글씨 묶음은 가로 74% · 세로 76% 까지 꽉 채운다(M1). 동그라미로 자르는 안드로이드에서
  잘리는 글자가 0% 인 가장 큰 크기다(실측: 82% 는 0.2%, 88% 는 2.8% 잘림).
  글꼴은 assets/fonts/Jua-Regular.ttf (구글 폰트, OFL - 상업적 사용 가능, Jua-OFL.txt).
  그림을 바꾸면 blogger/theme-template.xml 의 아이콘 주소 ?v= 숫자를 올린다.

★ 사용자가 만든 로고 그림(화살표+자동차)을 넣어봤다가 작은 크기에서 어색해 되돌렸다.
  홈 화면 아이콘은 작게 보이므로 글자처럼 단순해야 한다.

★ 이 그림이 없으면 폰이 알아서 만든다 - 주소 첫 글자 한 자를 동그라미에
  넣어버린다(실제로 'L' 로 나왔다, 2026-09-24). 무슨 앱인지 알 수가 없다.
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img")
FONT = os.path.join(ROOT, "assets", "fonts", "Jua-Regular.ttf")

BG = (17, 17, 17)
MAIN = [("갈까", (255, 255, 255)), ("말까", (255, 99, 99))]
SUB, SUB_COLOR = "주유소찾기", (110, 231, 183)
SUB_RATIO = 0.44         # 주유소찾기 크기 = 갈까말까 글자 크기의 44%
GAP, SUB_GAP = 0.06, 0.16  # 줄 사이 · 주유소찾기 위 간격 (글자 크기 대비)
FILL_W, FILL_H = 0.74, 0.76
SIZE = 1024              # 큰 걸로 한 번 그리고 줄인다 (글자가 매끄러워진다)


def layout(d, px):
    fm = ImageFont.truetype(FONT, px)
    fs = ImageFont.truetype(FONT, int(px * SUB_RATIO))
    bm = [d.textbbox((0, 0), t, font=fm) for t, _ in MAIN]
    bs = d.textbbox((0, 0), SUB, font=fs)
    w = max(max(b[2] - b[0] for b in bm), bs[2] - bs[0])
    h = sum(b[3] - b[1] for b in bm) + px * GAP + px * SUB_GAP + (bs[3] - bs[1])
    return fm, fs, bm, bs, w, h


def make():
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # 묶음 전체가 채움 한도 안에 딱 맞게 키운다. 가로만 보면 세로가 넘친다.
    px = 100
    while True:
        *_, w, h = layout(d, px + 5)
        if w > SIZE * FILL_W or h > SIZE * FILL_H:
            break
        px += 5
    fm, fs, bm, bs, w, h = layout(d, px)

    y = (SIZE - h) / 2
    for (text, color), b in zip(MAIN, bm):
        d.text(((SIZE - (b[2] - b[0])) / 2 - b[0], y - b[1]), text, font=fm, fill=color)
        y += (b[3] - b[1]) + px * GAP
    y += px * (SUB_GAP - GAP)
    d.text(((SIZE - (bs[2] - bs[0])) / 2 - bs[0], y - bs[1]), SUB, font=fs, fill=SUB_COLOR)

    os.makedirs(OUT, exist_ok=True)
    for n in (180, 192, 512):
        path = os.path.join(OUT, "icon-%d.png" % n)
        img.resize((n, n), Image.LANCZOS).save(path, "PNG", optimize=True)
        print("아이콘:", path)
    return img


if __name__ == "__main__":
    make()
