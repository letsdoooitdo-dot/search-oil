# -*- coding: utf-8 -*-
"""주유 꿀팁 글을 블로그스팟용 HTML 로 만든다.

글 본문은 공용 렌더러(블로그 글쓰기 스킬의 render_post.py)로 찍고,
그 렌더러가 자동으로 끼워 넣는 두 덩어리만 우리 것으로 바꿔 끼운다.

  ① 도입부 아래 '연관 혜택' 박스  -> 주유소찾기 홍보 박스
  ② FAQ 위 빨간 버튼             -> 주유소찾기로 보내는 버튼

렌더러는 정부지원금 사이트들을 위해 만든 것이라 기름값 글에 붙으면
주제가 어긋난다. 스킬 자체는 다른 사이트에서도 쓰므로 건드리지 않고,
여기서 결과물만 바꾼다.

  python build_tips.py          blog/ 에 다시 만든다
"""
import io, os, re, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = (r"C:\Users\컴퓨터\.claude\skills\synced"
         r"\15e3dfe7-e33b-465b-b495-63a1f2fde66c_0269ecb5-88f8-4325-8a69-6ceb85b84e39"
         r"\blog-writing-skill-1")
SITE = "https://16story-005.letsdoooit.com/"

# ── 우리 홍보 박스 ────────────────────────────────────────────
# 글을 끝까지 읽지 않는 사람이 훨씬 많다. 그래서 도입부 바로 아래,
# 아직 읽을 마음이 남아 있을 때 한 번 건다.
# 문구는 이 사이트가 다른 곳과 다른 점 하나만 말한다 -
# "제일 싼 집이 제일 이득은 아니다".
PROMO = (
  '<div style="width:100%; margin:22px 0; background:#ffffff; border-radius:12px;'
  ' overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.15);">'
  '<div style="background:#ffffff; font-size:1.15rem; font-weight:800; line-height:1.7;'
  ' padding:18px 14px 12px; text-align:center;">'
  '<span style="color:#111111;">제일 </span>'
  '<span style="color:#2b00fe;">싼 주유소</span>'
  '<span style="color:#111111;">가 제일 이득일까요?</span><br>'
  '<span style="color:#111111;">멀면 </span>'
  '<span style="color:red;">아낀 돈이 기름값으로</span>'
  '<span style="color:#111111;"> 나갑니다.....</span><br>'
  '<span style="color:#6aa84f;">거리까지 빼고 진짜 남는 곳</span>'
  '<span style="color:#111111;">을 찾아드립니다.</span></div>'
  '<a href="{site}" target="_blank" rel="noopener noreferrer"'
  ' style="display:block; background:#e53935; color:#ffffff; text-align:center;'
  ' font-weight:700; line-height:1.8; padding:16px 12px; margin:10px 14px;'
  ' border-radius:10px; text-decoration:none;">'
  '<span style="font-size:medium;">✅ 기름값 − 오가는 기름값 = 진짜 이득<br>'
  '내 주변에서 진짜 남는 주유소 찾아보기</span></a>'
  '<a href="{site}p/area.html" target="_blank" rel="noopener noreferrer"'
  ' style="display:block; background:#1a3b94; text-align:center; line-height:1.8;'
  ' padding:16px; margin:14px; border-radius:10px; text-decoration:none;">'
  '<span style="color:#fcff01; font-size:medium;">✅ 우리 동네 기름값은 얼마일까<br>'
  '전국 230개 시·군·구 오늘 가격 보기</span></a>'
  '<a href="{site}p/calc.html" target="_blank" rel="noopener noreferrer"'
  ' style="display:block; background:#1a3b94; text-align:center; line-height:1.8;'
  ' padding:16px; margin:14px; border-radius:10px; text-decoration:none;">'
  '<span style="color:#fcff01; font-size:medium;">✅ 몇 km까지 돌아가야 본전일까<br>'
  '내 차 연비로 손익분기 계산하기</span></a>'
  '</div>'
).format(site=SITE)

# ── 글 끝(FAQ 위) 빨간 버튼 ──────────────────────────────────
def button(text):
    return ('<div style="text-align: center; margin: 35px 0;">'
            '<a href="{site}" target="_blank" rel="noopener noreferrer"'
            ' style="display: inline-block; background-color: #ff0000; color: #ffffff;'
            ' font-size: 18px; font-weight: bold; padding: 16px 40px; border-radius: 50px;'
            ' text-decoration: none; box-shadow: 0 8px 20px rgba(255, 0, 0, 0.4);">'
            '{text}</a></div>').format(site=SITE, text=text)


def swap(html, btn_text):
    """렌더러가 넣은 두 덩어리를 우리 것으로 바꾼다.
       못 찾으면 조용히 넘어가지 않고 알린다 - 렌더러가 바뀌었다는 뜻이라
       모르고 지나가면 정부지원금 링크가 그대로 실린다."""
    n = 0
    # ① 연관 혜택 박스. 안쪽 <a> 세 개 중 마지막만 '</a></div>' 로 끝나므로
    #    거기까지 최소 매칭하면 박스 하나를 정확히 집는다.
    out, k = re.subn(
        r'<div style="width:100%; margin:20px 0;.*?</a></div>',
        PROMO.replace("\\", "\\\\"), html, flags=re.S)
    n += k
    # ② 빨간 버튼
    out, k2 = re.subn(
        r'<div style="text-align: center; margin: 35px 0;"><a href="https://16story-003[^>]*>.*?</a></div>',
        button(btn_text).replace("\\", "\\\\"), out, flags=re.S)
    n += k2
    if k != 1 or k2 != 1:
        raise SystemExit(f"  ! 바꿀 덩어리를 못 찾았습니다 (박스 {k}개, 버튼 {k2}개). "
                         "렌더러가 바뀌었는지 확인하세요.")
    if "16story-003" in out or "16story-002" in out:
        raise SystemExit("  ! 정부지원금 링크가 남아 있습니다.")
    return out


def main():
    sys.path.insert(0, SKILL)
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    from render_post import render_text, render_blogspot
    from tips_data import POSTS

    out_dir = os.path.join(ROOT, "blog")
    os.makedirs(out_dir, exist_ok=True)

    for i, d in enumerate(POSTS, 1):
        base = f"주유꿀팁_{i}_" + d["meta"]["permalink"]
        txt = render_text(d)
        io.open(os.path.join(out_dir, base + "_텍스트버전.md"), "w",
                encoding="utf-8").write(txt)
        html = swap(render_blogspot(d), d["button_text"])
        io.open(os.path.join(out_dir, base + "_블로그스팟.html"), "w",
                encoding="utf-8").write(html)
        print(f"[{i}편] {d['meta']['title']}")
        print(f"      {len(txt):,}자 · 홍보 박스와 버튼을 주유소찾기로 바꿨습니다")

    print("\n저장 위치:", out_dir)


if __name__ == "__main__":
    main()
