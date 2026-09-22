# 길찾기 중계 설치 (10분, 무료)

블로그를 공개하기 **전에** 반드시 해야 합니다.

## 왜 하나요

카카오 열쇠가 두 종류인데, 성격이 다릅니다.

| | 쓰는 곳 | 안전한가 |
|---|---|---|
| JavaScript 키 | 장소 검색, 지도 | **안전** — 우리 도메인에서만 작동하게 등록해뒀습니다 |
| REST 키 | 길찾기(도로거리) | **위험** — 카카오가 도메인 제한을 지원하지 않습니다 |

REST 키를 블로그 테마에 넣으면 누구나 소스를 열어보고 가져다 쓸 수 있습니다.
그래서 **열쇠는 중계 서버에 맡기고**, 블로그는 그 서버에만 부탁합니다.

```
브라우저  ──▶  Cloudflare Worker  ──▶  카카오
                (열쇠는 여기)
                (우리 주소에서 온 요청만 통과)
```

## 설치

### 1. 가입

[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — 이메일만 있으면 됩니다.
카드 등록 필요 없습니다.

### 2. Worker 만들기

좌측 **Workers & Pages** → **Create** → **Workers** → **Create Worker**

- 이름: `oil-navi`
- **Deploy** 클릭

### 3. 코드 넣기

방금 만든 Worker → **Edit code**

기존 내용을 전부 지우고 [worker.js](worker.js) 내용을 통째로 붙여넣습니다 → **Deploy**

### 4. 열쇠 넣기

Worker → **Settings** → **Variables and Secrets** → **Add**

| 항목 | 값 |
|---|---|
| Type | **Secret** |
| Variable name | `KAKAO_REST_KEY` |
| Value | 카카오 REST API 키 |

> REST 키는 [developers.kakao.com](https://developers.kakao.com) → 내 애플리케이션 →
> 주유소찾기 → 앱 키 → **REST API 키** 입니다. (JavaScript 키 아닙니다)

**Deploy** 클릭.

### 5. 주소 알려주기

화면에 나온 주소를 복사합니다. 이렇게 생겼습니다:

```
https://oil-navi.<계정이름>.workers.dev
```

이 주소를 `scripts/build_theme.py` 의 `NAVI_PROXY` 에 넣고 테마를 다시 만듭니다.

```python
NAVI_PROXY = "https://oil-navi.여기에계정이름.workers.dev"
```

```
python scripts\build_theme.py
```

주소를 넣으면 테마에서 REST 키가 **자동으로 빠집니다.** 빌드할 때 뜨던
"REST 키가 테마에 그대로 들어갑니다" 경고도 사라집니다.

## 확인

테마를 블로그에 올린 뒤, 주유소 목록에서 거리가 제대로 나오면 성공입니다.
거리가 "약 N km"(어림값)으로만 나오면 중계가 안 되는 것이니 알려주세요.

## 비용

무료 한도가 **하루 10만 요청**입니다.
검색 한 번에 1~13회를 쓰므로 하루 8,000명이 써도 남습니다.
같은 길은 하루 동안 중계 서버가 기억해뒀다가 카카오까지 가지 않고 바로 답하므로
실제로는 훨씬 적게 씁니다.
