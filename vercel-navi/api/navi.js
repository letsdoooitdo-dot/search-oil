/* 주유소찾기 - 길찾기 중계 (Vercel, 서울 리전)

   왜 Cloudflare 에서 옮겼나
     카카오 REST 키는 도메인 제한을 걸 수 없어 중계 서버가 필요하다.
     처음에는 Cloudflare Worker 를 썼는데, 무료 플랜은 한국 트래픽을
     서울이 아니라 홍콩·도쿄에서 처리했다(CF-RAY 가 HKG/NRT 였다).
     한국 사용자 -> 홍콩 -> 카카오(한국) -> 홍콩 -> 한국 으로 태평양을
     두 번 건너느라 한 건에 2~7초가 걸리고 실패도 섞였다.
     같은 순간 카카오 직접 호출은 0.4초였다.

     Vercel 은 vercel.json 에서 서울(icn1)을 지정할 수 있다.
     카카오 서버와 같은 나라에서 돌기 때문에 왕복이 짧다.

   설치
     1. github.com 에 이 폴더만 담은 저장소를 만든다 (search-oil-navi)
     2. vercel.com 가입 -> Add New Project -> 그 저장소를 Import
     3. Environment Variables 에 KAKAO_REST_KEY = 카카오 REST API 키
     4. Deploy 후 Settings -> Functions -> Region 이 Seoul(icn1) 인지 확인
     5. 만들어진 주소를 scripts/build_theme.py 의 NAVI_PROXY 에 넣고
        테마를 다시 만든다
*/

const HOST = 'https://apis-navi.kakaomobility.com';

/* 이 주소에서 온 요청만 받는다. 키를 훔쳐가도 다른 곳에서는 못 쓴다. */
const ALLOW = [
  'https://16story-005.letsdoooit.com',
  'http://localhost:8080',
];

/* 길찾기 말고 다른 카카오 API 로는 넘기지 않는다.
   주소를 그대로 받지 않고 이 표에 있는 것만 통과시킨다 - vercel.json 참고 */
const PATHS = {
  one:  '/v1/directions',
  many: '/v1/destinations/directions',
  via:  '/v1/waypoints/directions',
};

/* 카카오가 이 안에 답하지 않으면 놓아준다.
   브라우저도 7초에 끊으므로 그 전에 끝내야 어림값으로 넘어갈 수 있다. */
const TIMEOUT = 6000;

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const ok = ALLOW.indexOf(origin) >= 0;

  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(ok ? 204 : 403).end(); return; }
  if (!ok) { res.status(403).send('이 주소에서는 쓸 수 없습니다'); return; }

  const { k, ...rest } = req.query || {};
  const path = PATHS[k];
  if (!path) { res.status(404).send('없는 길입니다'); return; }
  if (!process.env.KAKAO_REST_KEY) {
    res.status(500).send('KAKAO_REST_KEY 가 설정되지 않았습니다');
    return;
  }

  /* GET 은 origin=..&destination=.. 처럼 물음표 뒤 값을 그대로 넘긴다 */
  const qs = new URLSearchParams(rest).toString();
  const target = HOST + path + (qs ? '?' + qs : '');

  /* 본문은 길이를 붙여 한 번에 보낸다. 길이를 모르는 채로 흘려보내면
     받는 쪽이 끝을 기다리느라 느려진다 - Cloudflare 에서 겪은 일이다. */
  let body;
  const headers = {
    Authorization: 'KakaoAK ' + process.env.KAKAO_REST_KEY,
    'Content-Type': 'application/json',
  };
  if (req.method === 'POST') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }

  const t0 = Date.now();
  let out;
  try {
    out = await fetch(target, {
      method: req.method,
      headers: headers,
      body: body,
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    res.status(502).send('길찾기 서버에 닿지 못했습니다');
    return;
  }

  const text = await out.text();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  /* 카카오까지 왕복에 걸린 시간 - 느려지면 여기부터 본다 */
  res.setHeader('X-Oil-Ms', String(Date.now() - t0));
  /* 같은 질문은 하루 동안 다시 묻지 않는다. 길은 하루에 안 바뀐다. */
  if (req.method === 'GET' && out.ok) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
  }
  res.status(out.status).send(text);
};
