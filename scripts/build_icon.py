# -*- coding: utf-8 -*-
"""휴대폰 홈 화면에 추가했을 때 쓰이는 아이콘을 만든다.

  img/icon-180.png   아이폰 (apple-touch-icon)
  img/icon-192.png   안드로이드 크롬
  img/icon-512.png   큰 화면·나중에 쓸 자리

★ 이 그림이 없으면 폰이 알아서 만든다 - 주소 첫 글자 한 자를 동그라미에
  넣어버린다(실제로 'L' 로 나왔다, 2026-09-24). 무슨 앱인지 알 수가 없다.

★ 안드로이드 런처는 아이콘을 **동그랗게 잘라** 쓰는 경우가 많다.
  그래서 글자는 가운데 원(지름의 78%) 안에 두고, 네 귀퉁이는 바탕색으로만
  채운다 - 귀퉁이에 뭘 그리면 잘려 나간다.
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img")

# 머리 띠(#017A75)와 '내 주변' 버튼(#0891B2)을 잇는 대각선 그라데이션.
# 사이트를 열었을 때 보이는 색과 같아야 "그 사이트" 로 알아본다.
C1 = (1, 122, 117)
C2 = (8, 145, 178)

TEXT = "다따져"          # 아이콘에 넣을 글자 - 세 자가 한계다
SIZE = 1024              # 큰 걸로 한 번 그리고 줄인다 (글자가 매끄러워진다)

FONTS = [
    r"C:\Windows\Fonts\malgunbd.ttf",   # 맑은 고딕 볼드
    r"C:\Windows\Fonts\malgun.ttf",
]


def font_for(px):
    for path in FONTS:
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    raise SystemExit("한글 글꼴을 못 찾았습니다: " + ", ".join(FONTS))


def make():
    img = Image.new("RGB", (SIZE, SIZE))
    d = ImageDraw.Draw(img)

    # 대각선 그라데이션 - 왼쪽 위에서 오른쪽 아래로
    for i in range(SIZE * 2):
        t = i / (SIZE * 2 - 1)
        c = tuple(round(C1[k] + (C2[k] - C1[k]) * t) for k in range(3))
        d.line([(i, 0), (0, i)], fill=c)

    # 글자를 '안전한 원' 안에 딱 맞게 키운다.
    # 가로만 보고 키우면 세로가 원 밖으로 나가므로 둘 다 본다.
    safe = SIZE * 0.72
    px = 10
    while True:
        f = font_for(px + 10)
        box = d.textbbox((0, 0), TEXT, font=f)
        if box[2] - box[0] > safe or box[3] - box[1] > safe * 0.62:
            break
        px += 10
    f = font_for(px)

    box = d.textbbox((0, 0), TEXT, font=f)
    x = (SIZE - (box[2] - box[0])) / 2 - box[0]
    y = (SIZE - (box[3] - box[1])) / 2 - box[1]
    d.text((x, y), TEXT, font=f, fill=(255, 255, 255))

    os.makedirs(OUT, exist_ok=True)
    for n in (180, 192, 512):
        path = os.path.join(OUT, "icon-%d.png" % n)
        img.resize((n, n), Image.LANCZOS).save(path, "PNG", optimize=True)
        print("아이콘:", path)


if __name__ == "__main__":
    make()
