/* 주유소찾기 - 길찾기 중계 (Cloudflare Worker)

   왜 필요한가
     카카오 REST 키는 JavaScript 키와 달리 "어느 도메인에서만"이라는 제한을 걸 수 없다.
     테마에 그대로 넣으면 누구나 보고 가져다 쓴다.
     그래서 키는 여기(서버)에 두고, 브라우저는 이 주소로만 부른다.

   설치 (developers.cloudflare.com 무료 계정)
     1. Workers & Pages -> Create -> Worker -> 이름 oil-navi -> Deploy
     2. Edit code -> 이 파일 내용을 통째로 붙여넣고 Deploy
     3. Settings -> Variables and Secrets -> Add
          이름  KAKAO_REST_KEY
          종류  Secret
          값    카카오 REST API 키
     4. 만들어진 주소(https://oil-navi.<계정>.workers.dev)를
        scripts/build_theme.py 의 NAVI_PROXY 에 넣고 테마를 다시 만든다

   무료 한도는 하루 10만 요청이다. 검색 한 번에 1~13회 쓰므로 한참 남는다.
*/

/* 이 주소에서 온 요청만 받는다. 키를 훔쳐가도 다른 곳에서는 못 쓴다. */
const ALLOW = [
  'https://16story-005.letsdoooit.com',
  'http://localhost:8080',
];

/* 길찾기 말고 다른 카카오 API 로는 넘기지 않는다 */
const PATHS = [
  '/v1/directions',
  '/v1/destinations/directions',
  '/v1/waypoints/directions',
];

const HOST = 'https://apis-navi.kakaomobility.com';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOW.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: ok ? 204 : 403, headers: ok ? cors(origin) : {} });
    }
    if (!ok) {
      return new Response('이 주소에서는 쓸 수 없습니다', { status: 403 });
    }

    const url = new URL(request.url);
    if (!PATHS.includes(url.pathname)) {
      return new Response('없는 길입니다', { status: 404, headers: cors(origin) });
    }
    if (!env.KAKAO_REST_KEY) {
      return new Response('KAKAO_REST_KEY 가 설정되지 않았습니다',
        { status: 500, headers: cors(origin) });
    }

    const target = HOST + url.pathname + url.search;
    const headers = {
      Authorization: 'KakaoAK ' + env.KAKAO_REST_KEY,
      'Content-Type': 'application/json',
    };

    /* 같은 질문은 카카오까지 가지 않고 여기서 답한다.
       길은 하루에도 안 바뀌지만, 공사나 개통이 있으므로 하루만 들고 있는다. */
    const cacheKey = new Request(target, { method: 'GET' });
    const cache = caches.default;
    if (request.method === 'GET') {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const r = new Response(hit.body, hit);
        Object.entries(cors(origin)).forEach(([k, v]) => r.headers.set(k, v));
        r.headers.set('X-Oil-Cache', 'hit');
        return r;
      }
    }

    let res;
    try {
      res = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.text() : undefined,
      });
    } catch (e) {
      return new Response('길찾기 서버에 닿지 못했습니다',
        { status: 502, headers: cors(origin) });
    }

    const body = await res.text();
    const out = new Response(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
    });

    if (request.method === 'GET' && res.ok) {
      const keep = new Response(body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8',
                   'Cache-Control': 'public, max-age=86400' },
      });
      await cache.put(cacheKey, keep);
    }
    return out;
  },
};
