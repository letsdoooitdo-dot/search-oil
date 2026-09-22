# 주유소찾기 길찾기 중계 (서울)

카카오 길찾기 REST 키를 숨기기 위한 중계 서버입니다.
브라우저는 이 주소로만 부르고, 키는 여기 환경변수에만 있습니다.

## 왜 서울이어야 하나

처음에는 Cloudflare Worker 를 썼습니다. 그런데 무료 플랜은 한국 트래픽을
서울이 아니라 **홍콩·도쿄**에서 처리했습니다(응답의 `CF-RAY` 끝이 HKG/NRT).

```
한국 사용자 → 홍콩 → 카카오(한국) → 홍콩 → 한국
```

태평양을 두 번 건너느라 **한 건에 2~7초**가 걸리고 실패(502)도 섞였습니다.
같은 순간 카카오를 직접 부르면 **0.4초**였습니다.

Vercel 은 `vercel.json` 의 `regions` 로 **서울(icn1)** 을 지정할 수 있어
카카오 서버와 같은 나라에서 돌아갑니다.

## 설치

새 저장소를 만들 필요는 없습니다. 지금 저장소를 그대로 쓰고
**Root Directory 만 이 폴더로** 지정하면 됩니다.

1. **Vercel 가입** — vercel.com → *Continue with GitHub*
2. **Add New… → Project** → `letsdoooitdo-dot/search-oil` 옆 **Import**
3. **Root Directory** — *Edit* 를 눌러 **`vercel-navi`** 를 고릅니다.
   ★ 이 단계를 빠뜨리면 저장소 전체를 웹사이트로 올리려다 실패합니다.
4. **Environment Variables** 를 펼쳐 넣습니다
   | 이름 | 값 |
   |---|---|
   | `KAKAO_REST_KEY` | 카카오 REST API 키 |
5. **Deploy**
6. 배포 후 **Settings → Functions → Function Region** 이
   **Seoul, South Korea (icn1)** 인지 확인합니다. 아니면 그렇게 바꾸고 다시 배포합니다.
7. 만들어진 주소(`https://<이름>.vercel.app`)를 알려주시면
   `scripts/build_theme.py` 의 `NAVI_PROXY` 에 넣고 테마를 다시 만들겠습니다.

## 확인

```bash
curl -s -o /dev/null -D - -X POST \
  "https://<이름>.vercel.app/v1/waypoints/directions" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:8080" \
  -d '{"origin":{"x":127.0568,"y":37.03846},"destination":{"x":127.1043,"y":37.2836},
       "waypoints":[{"x":127.07,"y":37.06,"name":"주유소"}],"priority":"RECOMMEND"}'
```

- `200` 과 함께 `X-Oil-Ms` 가 **1000 미만**이면 정상입니다(카카오까지 왕복 시간).
- `403` 이면 `api/navi.js` 의 `ALLOW` 에 그 주소가 없는 것입니다.
- `500` 이면 `KAKAO_REST_KEY` 가 비어 있습니다.

## 막아둔 것

- `ALLOW` 에 적힌 주소에서 온 요청만 통과합니다.
- 길찾기 세 경로(`one`/`many`/`via`) 외에는 404 입니다. 주소를 그대로
  넘기지 않고 표에 있는 것만 카카오로 보냅니다.
- 6초 안에 답이 없으면 끊습니다. 브라우저도 7초에 끊고 어림값으로 넘어갑니다.
