#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
머리 띠와 공유 카드 그림 만들기
================================
실행:  python build_images.py

  assets/hero-src.png  (원본 띠 그림)
      -> img/hero.webp   머리 띠 (가벼운 형식)
      -> img/hero.jpg    머리 띠 (웹피를 못 읽는 곳용)
      -> img/og.jpg      카톡·블로그 링크 카드용 1200x630

★ 그림은 반드시 img/ 에 넣는다.
  api/ 는 build_data.py 가 매일 통째로 지웠다가 다시 만든다.
  거기 두면 다음 날 아침에 사라진다(2026-09-23 실제로 겪었다).

★ 공유 카드는 '여백'이 핵심이다.
  카톡·블로그·페북이 카드 그림을 보여주는 비율이 저마다 다르다.
  1.91:1 로 딱 맞춰 만들어두면, 조금 더 정사각형에 가까운 곳에서는
  가운데만 잘라 쓰기 때문에 양옆 글자가 먹힌다.
  그래서 띠를 폭의 86% 로 줄여 가운데 놓고, 남는 자리는 띠의 가장자리
  색을 늘려 채운다. 좌우로 10% 씩 잘려도 글자가 그대로 남는다.

★ progressive(흐릿하게 나타났다 또렷해지는 방식)로 저장하지 않는다.
  미리보기 수집기 중에 그 형식을 못 읽는 것이 있다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC = os.path.join(ROOT, "assets", "hero-src.png")
OUT = os.path.join(ROOT, "img")

# 모든 페이지 맨 아래에 붙는 형제 사이트 배너.
# 원본이 1.7MB 짜리 그림이라 그대로 쓰면 모든 페이지가 3MB 씩 무거워진다.
# 둘을 나란히 놓으면 휴대폰에서 한 장이 190px 이라 600px 이면 넉넉하다.
PROMO = [("정부지원금찾기-최종2.png", "promo-gov.jpg"),
         ("24시 심야약국.png", "promo-pharm.jpg")]
PROMO_W = 600

HERO_W = 1200                 # 머리 띠 가로 (휴대폰에서 2배로 봐도 충분하다)
OG_W, OG_H = 1200, 630        # 카톡 큰 카드 규격 (1.91:1)
# 띠가 카드 폭에서 차지하는 비율. 나머지가 여백이 된다.
# 0.82 면 좌우 여백이 108px(9%) 씩 생긴다. 미리보기 상자가 1.5:1 까지
# 좁아져도(양옆 10.5% 씩 잘림) 글자가 살아남는 값이다. 실제로 잘라 확인했다.
OG_FILL = 0.82


def edge_extend(art, w, h):
    """띠를 가운데 놓고, 남는 자리를 띠의 가장자리 색으로 늘려 채운다.

    바탕이 단색에 가까운 그라데이션이라 가장자리를 늘리면 이어 붙인 티가 안 난다.
    단색으로 칠하면 그라데이션과 어긋나 경계선이 보인다."""
    aw, ah = art.size
    x0, y0 = (w - aw) // 2, (h - ah) // 2
    canvas = Image.new("RGB", (w, h))
    canvas.paste(art, (x0, y0))

    # 좌우 - 띠의 첫 칸 / 끝 칸을 옆으로 늘린다
    if x0 > 0:
        canvas.paste(art.crop((0, 0, 1, ah)).resize((x0, ah)), (0, y0))
        canvas.paste(art.crop((aw - 1, 0, aw, ah)).resize((w - x0 - aw, ah)),
                     (x0 + aw, y0))
    # 위아래 - 좌우를 채운 뒤의 한 줄을 통째로 늘린다
    if y0 > 0:
        band = canvas.crop((0, y0, w, y0 + 1))
        canvas.paste(band.resize((w, y0)), (0, 0))
        band = canvas.crop((0, y0 + ah - 1, w, y0 + ah))
        canvas.paste(band.resize((w, h - y0 - ah)), (0, y0 + ah))
    return canvas


def save_jpg(im, path, quality=86):
    # progressive=False : 한 번에 그리는 방식. 미리보기 수집기가 확실히 읽는다.
    im.convert("RGB").save(path, "JPEG", quality=quality, optimize=True,
                           progressive=False, subsampling=0)


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"원본 그림이 없습니다: {SRC}")
    os.makedirs(OUT, exist_ok=True)

    src = Image.open(SRC).convert("RGB")
    ratio = src.width / src.height

    # ── 머리 띠 ──────────────────────────────────────────────
    hero = src.resize((HERO_W, round(HERO_W / ratio)), Image.LANCZOS)
    hero.save(os.path.join(OUT, "hero.webp"), "WEBP", quality=82, method=6)
    save_jpg(hero, os.path.join(OUT, "hero.jpg"))

    # ── 공유 카드 ────────────────────────────────────────────
    art_w = round(OG_W * OG_FILL)
    art = src.resize((art_w, round(art_w / ratio)), Image.LANCZOS)
    og = edge_extend(art, OG_W, OG_H)
    save_jpg(og, os.path.join(OUT, "og.jpg"))

    # ── 형제 사이트 배너 ────────────────────────────────────
    made = ["hero.webp", "hero.jpg", "og.jpg"]
    for src_name, out_name in PROMO:
        src_path = os.path.join(ROOT, "assets", src_name)
        if not os.path.exists(src_path):
            print(f"  [건너뜀] assets/{src_name} 가 없습니다")
            continue
        im = Image.open(src_path).convert("RGB")
        w = PROMO_W
        im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
        save_jpg(im, os.path.join(OUT, out_name), quality=80)
        made.append(out_name)

    side = (OG_W - art_w) // 2
    print("만든 그림")
    for name in made:
        p = os.path.join(OUT, name)
        im = Image.open(p)
        print(f"  {name:10s} {im.size[0]}x{im.size[1]}  "
              f"{os.path.getsize(p)/1024:,.0f}KB")
    print(f"\n공유 카드 좌우 여백 {side}px ({side/OG_W:.0%}) - "
          f"양옆이 그만큼 잘려도 글자가 남습니다")


if __name__ == "__main__":
    main()
