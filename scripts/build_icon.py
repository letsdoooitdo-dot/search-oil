# -*- coding: utf-8 -*-
"""휴대폰 홈 화면에 추가했을 때 쓰이는 아이콘을 만든다.

  img/icon-180.png   아이폰 (apple-touch-icon)
  img/icon-192.png   안드로이드 크롬
  img/icon-512.png   큰 화면·나중에 쓸 자리

원본은 assets/app-icon-src.png (2026-09-27 사용자가 준 '갈까말까-최종로고.png' 복사본,
1254px 정사각형). 홈 화면 이름은 "갈까말까" - blogger/theme-template.xml 의
apple-mobile-web-app-title. 그림을 바꾸면 템플릿의 ?v= 숫자도 올린다.

★ 원본은 귀퉁이가 흰색으로 둥글게(반지름 약 250px) 되어 있다. 폰이 모서리를 다시
  둥글게 자르므로, 그대로 쓰면 귀퉁이에 흰 조각이 남는다. 흰 귀퉁이가 사라질 만큼
  안쪽으로 잘라 쓴다(약 7%). 화살표·자동차는 그 안쪽이라 잘리지 않는다.

★ 이 그림이 없으면 폰이 알아서 만든다 - 주소 첫 글자 한 자를 동그라미에
  넣어버린다(실제로 'L' 로 나왔다, 2026-09-24). 무슨 앱인지 알 수가 없다.

★ 폰이 모서리를 알아서 둥글게 자른다. 그래서 원본은 귀퉁이까지 그림이 꽉 찬
  정사각형이어야 한다 - 이 로고는 귀퉁이가 하늘·도로로 차 있어 그대로 쓴다.
  투명한 부분이 있으면 아이폰은 검게 칠하므로 RGB 로 바꿔 저장한다.
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "app-icon-src.png")
OUT = os.path.join(ROOT, "img")


def white(p):
    return min(p) > 235


def corner_inset(img):
    """네 귀퉁이의 흰 둥근 부분이 다 빠지는 안쪽 여백(px). 귀퉁이가 차 있으면 0."""
    w, h = img.size
    worst = 0
    for cx, cy, sx, sy in ((0, 0, 1, 1), (w - 1, 0, -1, 1), (0, h - 1, 1, -1), (w - 1, h - 1, -1, -1)):
        i = 0
        while i < min(w, h) // 3 and white(img.getpixel((cx + sx * i, cy + sy * i))):
            i += 1
        worst = max(worst, i)
    return worst + 10 if worst else 0      # 둥근 선의 흐릿한 가장자리까지 넉넉히


def make():
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    if w != h:                       # 정사각형이 아니면 가운데를 잘라 맞춘다
        s = min(w, h)
        img = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
        w = h = s
    m = corner_inset(img)
    if m:
        img = img.crop((m, m, w - m, h - m))
        print("흰 귀퉁이를 잘라냈습니다: 가장자리 %dpx (%.1f%%)" % (m, m * 100 / w))
    # 귀퉁이 근처만 검사한다 - 가장자리 가운데에는 흰 구름이 걸쳐 있을 수 있다
    n = img.size[0] - 1
    left = sum(1 for i in range(60) for p in (
        img.getpixel((i, 0)), img.getpixel((0, i)), img.getpixel((n - i, 0)), img.getpixel((n, i)),
        img.getpixel((i, n)), img.getpixel((0, n - i)), img.getpixel((n - i, n)), img.getpixel((n, n - i)))
        if white(p))
    if left:
        raise SystemExit("귀퉁이에 흰 부분이 %d곳 남았습니다. 원본을 확인하세요." % left)

    os.makedirs(OUT, exist_ok=True)
    for n in (180, 192, 512):
        path = os.path.join(OUT, "icon-%d.png" % n)
        img.resize((n, n), Image.LANCZOS).save(path, "PNG", optimize=True)
        print("아이콘:", path, "%dKB" % (os.path.getsize(path) // 1024))


if __name__ == "__main__":
    make()
