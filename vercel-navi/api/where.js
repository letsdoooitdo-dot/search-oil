/* 주유소찾기 - 접속 지점의 대략 위치 (IP 기반)

   왜 필요한가
     앱 안 브라우저(인스타·스레드)는 위치를 안 내준다. 앱 자체에 위치 권한이
     없으면 건네줄 게 없어서 그냥 늘어진다 - 우리가 고칠 수 있는 자리가 아니다.
     그래서 '위치 권한 없이 얻는 대략 위치'가 필요하다.

   어디서 오는 값인가
     베르셀이 요청마다 접속자 IP 를 자기 데이터베이스에서 찾아 헤더로 넣어준다.
     따로 부르는 곳도, 키도, 비용도 없다. 권한 창도 안 뜨고 즉시 답한다.

   ★ 정확도는 믿을 수 없다. 와이파이·유선은 대개 시군구까지 맞지만,
     LTE·5G 는 통신사 관문 주소로 잡혀 엉뚱한 도시가 나오는 일이 흔하다.
     그래서 이 값은 '추측'으로만 쓰고, 화면에서 사용자에게 확인을 받아야 한다.
     (실측 결과는 iptest.html 로 재본다)
*/

const ALLOW = [
  'https://16story-005.letsdoooit.com',
  'https://letsdoooitdo-dot.github.io',   /* 실측 페이지 */
  'http://localhost:8080',
];

module.exports = function handler(req, res) {
  const origin = req.headers.origin || '';
  const ok = ALLOW.indexOf(origin) >= 0;

  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(ok ? 204 : 403).end(); return; }
  if (!ok) { res.status(403).send('이 주소에서는 쓸 수 없습니다'); return; }

  const h = req.headers;
  /* 도시 이름은 한글이면 퍼센트 인코딩되어 온다 */
  function dec(v) {
    if (!v) return '';
    try { return decodeURIComponent(v); } catch (e) { return v; }
  }

  const la = parseFloat(h['x-vercel-ip-latitude']);
  const ln = parseFloat(h['x-vercel-ip-longitude']);

  /* 사람마다 다른 답이라 절대 캐시하면 안 된다.
     한 번 캐시되면 다음 사람에게 남의 동네를 보여주게 된다. */
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({
    la: isFinite(la) ? la : null,
    ln: isFinite(ln) ? ln : null,
    city: dec(h['x-vercel-ip-city']),
    region: dec(h['x-vercel-ip-country-region']),
    country: h['x-vercel-ip-country'] || '',
    tz: h['x-vercel-ip-timezone'] || '',
    ip: h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim(),
  }));
};
