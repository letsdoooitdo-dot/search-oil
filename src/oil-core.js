/* 주유소찾기 - 공통 (데이터 불러오기·숫자 포맷·광고·해설 문장) */
(function () {
  'use strict';

  var CFG = window.OIL_CONFIG || {};
  var OIL = window.OIL = window.OIL || {};

  OIL.cfg = CFG;

  /* ── 숫자·문자 ───────────────────────────────────────────── */
  OIL.won = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
  OIL.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  OIL.dateKo = function (iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
  };
  /* 받침 유무로 은/는 같은 조사를 고른다 */
  OIL.josa = function (word, pair) {
    pair = pair || '은는';
    if (!word) return pair[1];
    var ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return pair[1];
    return (ch - 0xac00) % 28 ? pair[0] : pair[1];
  };

  /* ── 데이터 ──────────────────────────────────────────────── */
  var cache = {};
  OIL.load = function (path) {
    if (cache[path]) return cache[path];
    var base = (CFG.dataBaseUrl || '').replace(/\/+$/, '');
    cache[path] = fetch(base + '/' + path, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error(path + ' ' + r.status);
        return r.json();
      })
      .catch(function (e) { delete cache[path]; throw e; });
    return cache[path];
  };
  OIL.meta = function () { return OIL.load('meta.json'); };
  OIL.regions = function () { return OIL.load('regions.json'); };
  OIL.region = function (slug) { return OIL.load('region/' + encodeURIComponent(slug) + '.json'); };

  /* ── 화면 ────────────────────────────────────────────────── */
  OIL.root = function () { return document.getElementById('oil-root'); };
  OIL.loading = function (msg) {
    var r = OIL.root();
    if (r) r.innerHTML = '<div class="oil-loading">' + OIL.esc(msg || '불러오는 중...') + '</div>';
  };
  OIL.fail = function (e) {
    var r = OIL.root();
    if (r) {
      r.innerHTML = '<div class="oil-error">데이터를 불러오지 못했습니다.<br>' +
        '잠시 후 다시 시도해주세요.</div>';
    }
    if (window.console) console.error(e);
  };
  OIL.areaUrl = function (slug) {
    return (CFG.areaPageUrl || '/p/area.html') + '?r=' + encodeURIComponent(slug);
  };
  OIL.param = function (k) {
    return new URLSearchParams(location.search).get(k) || '';
  };

  /* ── 거리와 손익분기 ─────────────────────────────────────────
     우리 서비스의 핵심이다. "싼 집이 항상 이득은 아니다" 를 숫자로 보여준다.
     거리는 전부 카카오 길찾기의 실제 도로거리다(oil-road.js). 직선거리는
     후보를 고를 때만 쓴다. */

  OIL.distKm = function (lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  /* price  이 주유소 가격
     base   기준 주유소 가격 (여기서 가장 가까운 집 - 아무것도 안 따지면 갔을 곳)
     km     출발지 → 이 주유소 실제 도로거리
     baseKm 출발지 → 기준 주유소 실제 도로거리
     round  왕복이면 true (주유만 하러 갔다 돌아옴)

     기준 주유소도 어차피 가야 하므로, 무는 것은 '더 가는 거리'뿐이다.
     출발지에서의 전체 거리를 물리면 가까운 집이 공짜가 되어 늘 이긴다. */
  OIL.calcTrip = function (price, base, km, baseKm, round) {
    var car = (OIL.prefs && OIL.prefs.car()) || { kmpl: 12, usual: 30, label: '일반 승용차' };
    var L = car.usual, kmpl = car.kmpl;
    var mult = round ? 2 : 1;
    var extra = Math.max(0, km - (baseKm || 0));   /* 기준보다 더 가는 도로거리 */
    var drive = extra * mult;                      /* 왕복이면 두 배 */
    var cost = drive / kmpl * price;               /* 더 가느라 쓰는 기름값 */
    var gain = (base - price) * L;                 /* 싸게 넣어 아끼는 돈 */
    /* 손익분기: 기준보다 몇 km 더 가는 데까지 본전인가 */
    var beKm = price > 0 ? gain * kmpl / (price * mult) : 0;
    return { km: km, extra: extra, drive: drive, round: !!round,
             cost: cost, gain: gain, net: gain - cost, beKm: beKm,
             L: L, kmpl: kmpl, car: car };
  };

  /* 카드에 넣을 판정 문구.
     결론을 먼저 굵게 한 줄, 근거는 그 아래 작은 글씨로 붙인다.
     "빼도 이득" 처럼 계산 과정을 말하면 한 번 더 생각해야 읽힌다 -
     "얼마를 더 아낀다"로 먼저 말하고, 왜 그런지는 아래 줄에 둔다.
     kind='detour' 면 목적지 모드라 '더 간다'가 아니라 '돌아간다'로 말한다. */
  OIL.tripLine = function (t, isBase, kind) {
    var off = (kind === 'detour');
    var go = off ? '돌아가도' : '더 가도';
    /* "더 드는 기름값"은 읽기가 어렵다. '더'(무엇에 비해?)와 '드는'(무슨 돈?)이
       겹쳐서 한 번 더 생각해야 뜻이 잡힌다. 돈이 어디에 쓰이는지를 그대로 적는다. */
    var costName = off ? '들렀다 가는' : '거기까지 가는';
    function sub(s) { return '<span class="oil-st-sub">' + s + '</span>'; }

    if (isBase) {
      return { cls: 'is-base',
               text: (off ? '가는 길에서 <b>제일 안 돌아가는 곳</b>'
                          : '여기서 <b>제일 가까운 주유소</b>') +
                     sub('이 집을 기준으로 나머지를 비교합니다') };
    }
    if (t.gain <= 0) {
      return { cls: 'is-bad',
               text: (t.gain === 0 ? '<b>가격이 같은데</b> ' : '<b>여기보다 비싼데</b> ') +
                     (off ? '돌아가야 합니다' : '더 멀기까지 합니다') };
    }
    if (t.net > 0) {
      /* 기준과 거의 같은 거리면 "0.0km 더 가도"라고 쓰게 되어 어색하다 */
      if (t.drive < 0.15) {
        return { cls: 'is-good',
                 text: '<b>' + OIL.won(t.net) + '원 더 아낍니다</b>' +
                       sub('거의 같은 거리인데 기름값이 쌉니다') };
      }
      return { cls: 'is-good',
               text: '<b>' + OIL.won(t.net) + '원 더 아낍니다</b>' +
                     sub(t.drive.toFixed(1) + 'km ' + go + ', ' + costName + ' 기름값 ' +
                         OIL.won(t.cost) + '원을 뺀 금액입니다') };
    }
    /* 싸긴 한데 오가는 기름값이 더 큰 경우 - 이게 우리가 잡아주는 함정이다 */
    return { cls: 'is-bad',
             text: '<b>' + OIL.won(-t.net) + '원 손해입니다</b>' +
                   sub('싸게 넣어 ' + OIL.won(t.gain) + '원 아끼는데, ' +
                       (off ? '돌아서' : '거기까지') + ' ' + t.drive.toFixed(1) +
                       'km 가는 기름값이 ' + OIL.won(t.cost) + '원입니다') };
  };

  /* ── 주유소 상표 ──────────────────────────────────────────
     로고 그림은 상표권이 있어 쓸 수 없다. 대신 상표를 알아볼 수 있게
     그 회사 간판 색으로 약칭 배지를 만든다. 색만 봐도 구분이 된다. */
  var BRANDS = {
    'SK에너지':      { s: 'SK',   bg: '#E8112D', fg: '#fff' },
    'GS칼텍스':      { s: 'GS',   bg: '#00A94F', fg: '#fff' },
    'HD현대오일뱅크': { s: '현대', bg: '#0F4C91', fg: '#fff' },
    'S-OIL':        { s: 'S',    bg: '#FFD400', fg: '#1A1A1A' },
    'NH-OIL':       { s: 'NH',   bg: '#0068B7', fg: '#fff' },
    '알뜰주유소':     { s: '알뜰', bg: '#F47920', fg: '#fff' },
    '알뜰(ex)':      { s: '알뜰', bg: '#00843D', fg: '#fff' },
    '자가상표':       { s: '자가', bg: '#8494AD', fg: '#fff' }
  };
  var NO_BRAND = { s: '주유', bg: '#B6C2D6', fg: '#fff' };

  OIL.brand = function (b) { return BRANDS[b] || NO_BRAND; };
  OIL.brandChip = function (b, cls) {
    var x = OIL.brand(b);
    return '<span class="oil-bc' + (cls ? ' ' + cls : '') + '" style="background:' +
      x.bg + ';color:' + x.fg + '" title="' + OIL.esc(b || '') + '">' + x.s + '</span>';
  };

  /* 찾아가기 - 카카오맵. API 키가 필요 없고 앱이 깔려 있으면 앱이 열린다. */
  OIL.mapUrl = function (s) {
    var name = String(s.n || '주유소').replace(/,/g, ' ');
    if (s.la && s.ln) {
      return 'https://map.kakao.com/link/to/' + encodeURIComponent(name) +
        ',' + s.la + ',' + s.ln;
    }
    return 'https://map.kakao.com/link/search/' + encodeURIComponent(name);
  };

  /* ── 어디서 열렸나 · 위치가 왜 막혔나 ──────────────────────
     '내 주변'과 '가는 길' 둘 다 위치로 시작한다. 실패했을 때 하는 말이
     화면마다 다르면 같은 상황에서 다른 안내를 보게 된다 - 여기 한 곳에
     모아두고 두 화면이 같이 쓴다. 대신 '무엇으로 대신할지'(동네로 찾기 /
     출발지 정하기)는 화면마다 달라서 부르는 쪽이 붙인다. */
  var ENV = OIL.env = {};

  /* 남의 사이트 안에 끼워져 있는가(iframe). 끼워진 화면에는 브라우저가
     위치를 아예 안 내준다 - 바깥 사이트가 allow="geolocation" 을
     붙여주지 않으면 거부로 떨어진다. window.top 을 읽다 막혀도 남의 집이다. */
  ENV.inFrame = function () {
    try { return window.top !== window.self; } catch (e) { return true; }
  };

  /* 앱이 품고 있는 브라우저(인앱 브라우저)인가.
     ★ 안드로이드 스레드의 UA 는 'Threads' 가 아니라 'Barcelona' 다
       (스레드의 개발 시절 이름). 이것 때문에 스레드 유입을 놓쳤었다. */
  ENV.app = function () {
    var ua = navigator.userAgent || '';
    if (/Barcelona|Threads/i.test(ua)) return '스레드';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return '페이스북';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/NAVER\(inapp|NAVER\//i.test(ua)) return '네이버 앱';
    if (/Line\//i.test(ua)) return '라인';
    if (/DaumApps/i.test(ua)) return '다음 앱';
    if (/everytimeApp|BAND|TwitterAndroid|Snapchat/i.test(ua)) return '앱 안 브라우저';
    return '';
  };

  /* 휴대폰 '설정 → 애플리케이션' 목록에 적혀 있는 이름.
     우리는 읽기 좋으라고 '인스타그램'이라 부르지만 설정에는 'Instagram' 으로
     뜬다 - 안내대로 따라갔는데 그 이름이 없으면 거기서 멈춘다. */
  var SYSNAME = {
    '스레드': 'Threads', '인스타그램': 'Instagram', '페이스북': 'Facebook',
    '라인': 'LINE', '다음 앱': 'Daum'
  };
  ENV.appSysName = function () {
    var a = ENV.app();
    /* 어느 앱인지 못 알아본 경우(에브리타임·밴드 등 뭉뚱그린 이름)에는
       설정에서 찾을 이름이 없다. "애플리케이션 → 앱 안 브라우저" 를 찾으라고
       하면 그런 앱이 없어서 거기서 멈춘다. 사람 말로 바꿔준다. */
    if (!a || a === '앱 안 브라우저') return '지금 쓰고 계신 앱';
    return SYSNAME[a] || a;
  };

  /* 안내 제목에 쓸 이름. '앱 안 브라우저 앱에 …' 처럼 겹쳐 읽히지 않게 한다.
     ★ 권한은 앱마다 따로다. 인스타를 켜줬다고 스레드가 되지는 않는다 -
       안드로이드·아이폰 둘 다 설치된 앱 단위로 권한을 준다. 그래서 여기서
       고른 이름이 곧 사용자가 설정에서 찾아야 할 앱이다. */
  ENV.appLabel = function () {
    var a = ENV.app();
    return (!a || a === '앱 안 브라우저') ? '지금 쓰는 앱' : a + ' 앱';
  };

  ENV.isAndroid = function () { return /Android/i.test(navigator.userAgent || ''); };
  ENV.isIOS = function () { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); };

  /* ── 앱 안 브라우저를 빠져나와 크롬으로 ─────────────────────
     두 운영체제가 방법이 다르다.

     안드로이드 intent:// - 확실하다. 크롬이 없으면 S.browser_fallback_url
       덕에 기본 브라우저로라도 열린다. 그냥 <a href> 면 끝.

     아이폰 googlechromes:// - 크롬 iOS 가 가진 자기 주소다. https 를
       googlechromes 로, http 를 googlechrome 으로 바꿔 넣으면 크롬이 뜬다.
       ★ 다만 안드로이드와 달리 보장이 없다. (1) 크롬이 안 깔려 있으면
         아무 일도 안 일어나고, (2) 앱마다 이런 주소를 막아두기도 한다.
         실패해도 알려주지 않아서 버튼이 먹통처럼 보인다 - 그래서 눌러보고
         1.2초 안에 화면이 안 바뀌면 손으로 하는 법을 대신 띄운다
         (ENV.wireIosChrome). */
  ENV.chromeIntent = function () {
    var bare = location.href.replace(/^https?:\/\//, '');
    return 'intent://' + bare + '#Intent;scheme=https;package=com.android.chrome;' +
      'S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
  };

  ENV.iosChromeUrl = function () {
    return location.href.replace(/^https:/, 'googlechromes:')
                        .replace(/^http:/, 'googlechrome:');
  };

  /* 아이폰용 [크롬으로 열기] 버튼을 살린다.
     성공하면 우리 화면은 뒤로 물러나므로 visibilitychange/pagehide 가 온다.
     아무 일도 없으면 실패다 - 그때만 손으로 하는 법을 보여준다.
     ★ 시계도 같이 본다. 크롬으로 넘어가면 이 화면이 멈춰 setTimeout 이
       한참 뒤에야 깨는데, 그때 안내를 띄우면 돌아왔을 때 실패한 것처럼 뜬다. */
  ENV.wireIosChrome = function (btnId, tipId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var t0 = Date.now(), left = false;
      function gone() { left = true; }
      document.addEventListener('visibilitychange', gone);
      window.addEventListener('pagehide', gone);
      try { location.href = ENV.iosChromeUrl(); } catch (e) { left = false; }
      setTimeout(function () {
        document.removeEventListener('visibilitychange', gone);
        window.removeEventListener('pagehide', gone);
        if (left || document.visibilityState !== 'visible') return;
        if (Date.now() - t0 > 2500) return;      /* 화면이 멈췄다 돌아온 것 */
        var tip = document.getElementById(tipId);
        if (tip) tip.hidden = false;
        btn.disabled = true;
      }, 1200);
    });
  };

  ENV.allowHint = function () {
    if (ENV.isIOS()) {
      return '아이폰은 <b>설정 → 개인정보 보호 및 보안 → 위치 서비스</b>를 켜고, ' +
             '그 안에서 <b>Safari 웹사이트</b>(크롬을 쓰시면 <b>Chrome</b>)를 ' +
             '<b>앱을 사용하는 동안</b>으로 바꿔주세요. 그다음 이 화면을 새로고침하시면 됩니다.';
    }
    return '주소창 왼쪽 <b>자물쇠</b>를 누르고 <b>위치</b>(안드로이드는 <b>권한 → 위치</b>)를 ' +
           '<b>허용</b>으로 바꾼 뒤 다시 눌러주세요.';
  };

  /* 앱 안에서 빠져나가는 버튼. 이제는 '유일한 길'이 아니라 '곁다리 길'이라
     흐린 단추로 둔다 - 앱 권한만 켜면 앱 안에서도 되기 때문이다. */
  function chromeBtn() {
    return ENV.isAndroid()
      ? '<a class="oil-locate is-ghost" href="' + ENV.chromeIntent() + '">크롬으로 열기</a>'
      : '<button type="button" class="oil-locate is-ghost" id="oil-loc-chrome">' +
          '크롬으로 열기</button>' +
        '<div class="oil-locate-tip" id="oil-loc-tip" hidden>' +
          '크롬이 열리지 않았습니다. 오른쪽 위 <b>⋯</b>(또는 <b>⋮</b>)를 눌러 ' +
          '<b>브라우저로 열기</b>를 골라주세요.</div>';
  }

  /* 휴대폰 설정에서 그 앱의 위치 권한을 켜는 길. 세 군데에서 쓴다.
     ★ 앱마다 따로 준다 - 인스타를 켜줬다고 스레드가 되지 않는다. */
  function appPermPath() {
    var sys = OIL.esc(ENV.appSysName());
    return ENV.isIOS()
      ? '<b>설정 → 개인정보 보호 및 보안 → 위치 서비스 → ' + sys + '</b>을 ' +
        '<b>앱을 사용하는 동안</b>으로'
      : '<b>설정 → 애플리케이션 → ' + sys + ' → 권한 → 위치</b>를 ' +
        '<b>앱 사용 중에만 허용</b>으로';
  }

  /* kind: 'deny' 권한 거부 / 'appperm' 앱에 위치 권한 없음 /
           'unavail' 위치를 못 구함 / 'slow' 시간 초과 / 'none' 위치 기능 없음
     돌려주는 것: { head 제목, why 설명, extra 추가 버튼 HTML, solid 추가버튼이 주버튼인가 } */
  ENV.locateWhy = function (kind) {
    var app = ENV.app();
    var esc = OIL.esc;

    if (ENV.inFrame()) {
      return {
        head: '이 화면은 다른 사이트 안에 들어 있습니다',
        why: '끼워 넣어진 화면에는 브라우저가 위치를 내주지 않습니다. ' +
             '아래 <b>새 창에서 열기</b>를 누르면 바로 됩니다.',
        extra: '<button type="button" class="oil-locate" id="oil-loc-newwin">' +
               '새 창에서 열기</button>',
        solid: true
      };
    }

    /* ★ 앱 자체에 위치 권한이 없는 경우 (2026-09-24 인스타그램/안드로이드 실측).
       사이트에는 [허용]을 눌러줬는데도 code 2 로 0.0초에 즉시 실패하고, 메시지가
       'application does not have sufficient geolocation permissions' 였다.
       앱이 휴대폰에서 위치 권한을 못 받아 우리에게 건네줄 게 없는 것이다.
       ★ 이건 사용자가 고칠 수 있고 한 번 켜면 계속 된다 - 같은 기기에서 권한을
         켜고 다시 재니 6.9초에 100m 정확도로 잡혔다. 그래서 '크롬으로 열기'보다
         이쪽을 먼저 안내한다. 앱을 나갈 필요가 없다. */
    if (kind === 'appperm') {
      var nm = ENV.appLabel();
      return {
        head: nm + '에 위치 권한이 없습니다',
        why: '<b>' + esc(nm) + '</b> 자체가 휴대폰에서 위치 권한을 받지 못해, ' +
             '이 화면에 넘겨줄 위치가 없습니다.<br>' +
             appPermPath() + ' 바꿔주세요.' +
             '<br><b>한 번만 켜두면 그다음부터는 계속 됩니다.</b> ' +
             '켜신 뒤 아래 <b>[위치 다시 시도]</b>를 눌러주세요.',
        extra: chromeBtn()
      };
    }

    /* ★ 앱 안에서 실패하면 이유를 콕 집을 수가 없다 (2026-09-24 실측).
       위 'appperm' 판정은 안드로이드 웹뷰가 주는 영어 메시지에 기대는데,
       **앱마다 답이 다르다.** 같은 안드로이드인데도
         인스타그램 - code 2 + 그 메시지        -> 위에서 정확히 잡힌다
         스레드     - code 1 (그냥 '거부')        -> 못 잡는다
       아이폰(WKWebView)도 마찬가지로 '거부'로만 알려준다.
       ★ 처음엔 이 안내를 아이폰에만 달아뒀는데, 그래서 스레드에서 들어온
         사람은 "권한이 꺼져 있습니다"만 보고 **앱 권한을 켜는 법을 못 봤다.**
         운영체제가 아니라 '앱 안인가'로 갈라야 한다.
       한쪽만 찍어 말했다가 틀리면 맞는 해결책을 아예 못 보게 되므로 둘 다 적는다. */
    if (app && (kind === 'deny' || kind === 'unavail')) {
      return {
        head: (app === '앱 안 브라우저' ? '앱' : app) + ' 안에서 위치를 못 받았습니다',
        why: '둘 중 하나입니다.<br>' +
             '<b>①</b> <b>' + esc(ENV.appLabel()) + '</b> 자체에 위치 권한이 없는 경우 — ' +
             appPermPath() + ' 바꾸고 아래 <b>[위치 다시 시도]</b>. ' +
             '<b>한 번만 켜두면 계속 됩니다.</b><br>' +
             '<b>②</b> 방금 창에서 <b>[차단]</b>을 누르신 경우 — 앱 안 브라우저는 ' +
             '되돌릴 자리가 없어서, 아래에서 크롬으로 열어 다시 하셔야 합니다.',
        extra: chromeBtn()
      };
    }

    if (kind === 'none') {
      return { head: '이 브라우저는 위치 기능을 쓸 수 없습니다',
               why: '아래에서 동네나 장소 이름으로 찾아주세요.', extra: '' };
    }
    /* 여기부터는 앱 안이 아닌 경우다 (앱 안 + deny/unavail 은 위에서 끝났다) */
    if (kind === 'deny') {
      return { head: '위치 권한이 꺼져 있습니다', why: ENV.allowHint(), extra: '' };
    }
    if (kind === 'unavail') {
      return {
        head: '위치를 찾지 못했습니다',
        why: (ENV.isAndroid() || ENV.isIOS())
          ? '기기가 위치를 내주지 못했습니다. <b>휴대폰 설정에서 위치(GPS)</b>가 ' +
            '꺼져 있지 않은지 보시고, 그래도 안 되면 아래에서 동네 이름으로 찾아주세요.'
          : '<b>컴퓨터는 위치 장치가 없어</b> 인터넷 주소로 어림잡는데, 그게 자주 ' +
            '실패합니다. 기다린다고 되지는 않습니다 — 휴대폰에서는 대개 잡히고, ' +
            '지금은 아래에서 <b>동네 이름으로 찾으시면 결과는 똑같습니다.</b>',
        extra: '' };
    }
    /* 시간 초과. 앱 안이라면 '앱이 답을 안 준 것'일 수도 있으니 그 길도 알려준다 -
       실내·지하 탓만 하면 정작 고칠 수 있는 사람이 못 고친다. */
    return { head: '위치 확인이 오래 걸립니다',
             why: 'GPS로 한 번 더 해봤는데도 시간이 넘었습니다. ' +
                  '실내나 지하에서 자주 그렇습니다.' +
                  (app
                    ? '<br><b>' + esc(ENV.appLabel()) + '</b> 자체에 위치 권한이 없어도 ' +
                      '이렇게 됩니다 — ' + appPermPath() + ' 바꿔보세요. ' +
                      '<b>한 번만 켜두면 계속 됩니다.</b>'
                    : ' 다시 시도하거나, 동네 이름으로 바로 찾으셔도 됩니다.'),
             extra: app ? chromeBtn() : '' };
  };

  /* 위 extra 에 들어간 버튼들을 살린다 - 어느 쪽이든 없으면 그냥 넘어간다 */
  ENV.wireWhy = function () {
    var w = document.getElementById('oil-loc-newwin');
    if (w) {
      w.addEventListener('click', function () {
        window.open(location.href, '_blank', 'noopener');
      });
    }
    ENV.wireIosChrome('oil-loc-chrome', 'oil-loc-tip');
  };

  /* ── 앱 안이라고 미리 알려주던 띠는 뺐다 (2026-09-24) ────────
     "OO 안에서 보고 계십니다. 내 주변 찾기는 브라우저에서 열어야 됩니다" 라는
     띠를 화면 맨 위에 띄웠었다. 그 전제가 실측으로 깨졌다 - 앱 안에서도
     위치는 된다(인스타그램/안드로이드, 6.9초, 오차 100m). 앱에 위치 권한을
     준 사람에게 "여기선 안 됩니다"라고 말하는 셈이라 거짓말이 된다.
     ★ 이제는 미리 겁주지 않고, 실패했을 때 그 이유를 정확히 짚어준다.
       앱 권한이 없는 경우는 0.0초에 판정되므로 기다리게 하지도 않는다.
     되살리려면 git 에서 이 커밋 이전의 ENV.bannerHtml / .oil-inapp 을 본다. */

  /* ── 위치 받기 (모든 화면이 같이 쓴다) ──────────────────────
     onFail(kind) 로 'deny'|'appperm'|'unavail'|'slow'|'none' 을 돌려준다.

     ★★ 기다릴 시간은 '권한 창이 떠 있을지'로 정한다 (2026-09-24 실측).
       타이머는 권한 창이 떠 있는 동안에도 계속 흐른다. 짧게 잡으면 사용자가
       [허용]을 누르기도 전에 우리가 요청을 죽인다. 인스타그램 안에서 재보니
       성공까지 6.9초가 걸렸는데 그 대부분이 창을 읽고 누르는 시간이었다 -
       예전의 '앱 안이면 5초 컷'이 바로 이 사고였다. 될 사람을 끊고 있었다.
       앱 안이라고 짧게 끊지 않는다. 앱 안에서도 위치는 된다.

     ★ 앱 안 브라우저가 못 준다는 건 틀린 전제였다. 인스타그램은 위치 요청을
       제대로 구현해뒀고 권한 창도 띄운다. 막히는 건 한 겹 아래 - 인스타 앱
       자체가 휴대폰에서 위치 권한을 못 받았을 때다(아래 'appperm'). */
  var WAIT = {
    prompt:  30000,   /* 창을 읽고 누를 시간까지 준다 */
    granted: 8000,    /* 이미 허락했으니 바로 와야 한다 */
    gps:     15000    /* 2차 - 위성을 잡는 시간 */
  };

  /* 실패 이유를 가른다.
     ★ code 2 인데 메시지에 'sufficient geolocation permissions' 가 있으면
       브라우저가 위치를 못 구한 게 아니라 **앱 자체에 위치 권한이 없는** 것이다.
       인스타그램/안드로이드에서 실제로 이 메시지를 받았다(2026-09-24).
       사이트에는 [허용]을 눌러줬는데도 0.0초에 즉시 실패한다 - 기다린다고
       되지 않고, 휴대폰 설정에서 그 앱의 권한을 켜야 한다. */
  function failKind(err) {
    var code = err ? err.code : 0;
    var msg = (err && err.message) || '';
    if (code === 2 && /sufficient\s+geolocation\s+permissions/i.test(msg)) return 'appperm';
    return code === 1 ? 'deny' : code === 2 ? 'unavail' : 'slow';
  }

  ENV.locate = function (onOk, onFail, onStep) {
    if (!navigator.geolocation) { onFail('none'); return; }

    function attempt(gps, ms) {
      /* 30초를 말없이 기다리면 멈춘 화면처럼 보인다. 중간에 한 번 말을 건다 -
         권한 창이 다른 화면에 가려 안 보이는 경우도 이 말로 알아챈다. */
      var nudge = null;
      if (onStep && ms >= 20000) {
        nudge = setTimeout(function () {
          onStep('아직 기다리는 중입니다. 위치 창이 떠 있으면 [허용]을 눌러주세요.');
        }, 8000);
      }
      function stop() { if (nudge) { clearTimeout(nudge); nudge = null; } }

      navigator.geolocation.getCurrentPosition(function (pos) {
        stop(); onOk(pos);
      }, function (err) {
        stop();
        var kind = failKind(err);
        /* 시간 초과일 때만 GPS 로 한 번 더. 나머지는 다시 해도 같은 답이다. */
        if (!gps && kind === 'slow') {
          if (onStep) onStep('GPS로 한 번 더 잡아보는 중... (최대 15초)');
          attempt(true, WAIT.gps);
          return;
        }
        onFail(kind);
      }, { enableHighAccuracy: !!gps, timeout: ms, maximumAge: gps ? 0 : 300000 });
    }

    /* 권한 상태를 모를 때 가는 길. 창이 뜬다고 보고 넉넉히 기다린다. */
    function askFresh() {
      if (onStep) onStep('위치를 물어보는 창이 뜹니다. [허용]을 눌러주세요.');
      attempt(false, WAIT.prompt);
    }

    /* ★ 사파리(아이폰)는 Permissions API 가 있어도 'geolocation' 은 모른다.
       거절된 약속으로 오는 게 보통이지만, 그 자리에서 예외를 던지는 구현도 있다.
       그러면 여기서 통째로 죽어 버튼이 영영 '확인 중'으로 멈춘다 - try 로 감싼다.
       결국 아이폰은 늘 이 길로 온다(상태를 알 수 없으니 넉넉히 기다린다). */
    var q = null;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        q = navigator.permissions.query({ name: 'geolocation' });
      }
    } catch (e) { q = null; }

    if (q && q.then) {
      q.then(function (st) {
        if (st.state === 'denied') { onFail('deny'); return; }
        if (st.state === 'granted') { attempt(false, WAIT.granted); return; }
        askFresh();
      }).catch(askFresh);
    } else {
      askFresh();
    }
  };

  /* ── 광고 ──────────────────────────────────────────────────
     자리마다 광고 단위 번호를 나눈다.
       kind='top'  화면 맨 위      (adSlotTop)
       그 외        내용 중간       (adSlot)
     모양 때문이 아니다 - 둘 다 format=auto 라 애드센스가 폭을 보고 알아서
     고른다. 나누는 실익은 수익 보고서에서 어느 자리가 돈이 되는지
     갈라 보는 것이다. */
  OIL.adHtml = function (kind) {
    var slot = (kind === 'top' && CFG.adSlotTop) ? CFG.adSlotTop : CFG.adSlot;
    if (!CFG.adClient || !slot) return '';
    return '<div class="oil-ad"><div class="oil-ad-label">광고</div>' +
      '<ins class="adsbygoogle" style="display:block"' +
      ' data-ad-client="' + CFG.adClient + '"' +
      ' data-ad-slot="' + slot + '"' +
      ' data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
  };
  /* 광고 자리. 개발 중(ADS_ON=False)에도 자리는 남겨둬야 나중에 광고를 켤 때
     화면이 밀리지 않는다. 그래서 빈 상자를 같은 크기로 그려둔다. */
  OIL.adSlotHtml = function (kind) {
    var ad = OIL.adHtml(kind);
    if (ad) return ad;
    return '<div class="oil-ad is-empty"><span>광고 영역</span></div>';
  };

  /* 화면을 그린 뒤 호출한다. 아직 요청하지 않은 ins 만 채운다. */
  OIL.adFill = function () {
    try {
      var list = document.querySelectorAll('ins.adsbygoogle');
      for (var i = 0; i < list.length; i++) {
        if (list[i].getAttribute('data-adsbygoogle-status')) continue;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) { /* 광고 차단기 등 - 화면은 그대로 둔다 */ }
  };

  OIL.render = function (html) {
    var r = OIL.root();
    if (!r) return;
    r.innerHTML = html;
    OIL.adFill();
  };

  /* ── 동네 해설 (파이썬 build_area_pages 와 같은 규칙) ──────
     s = 지금 고른 유종의 통계 {n,lo,md,hi,sp,rk}
     손익분기 거리는 고른 차종의 연비·주유량으로 계산한다 - 차종에 따라 2배까지 달라진다 */
  OIL.verdict = function (r, meta, total, s, fuelName) {
    s = s || r.g || r;
    fuelName = fuelName || '휘발유';
    var big = (meta && meta.spreadBig) || 250;
    var small = (meta && meta.spreadSmall) || 60;
    var car = (OIL.prefs && OIL.prefs.car()) || { kmpl: 12, usual: 30, label: '일반 승용차' };
    var L = car.usual, kmpl = car.kmpl;
    var saved = s.sp * L;
    var head, body;
    /* 동네 화면에는 차종 고르개가 없다(계산기·주유소 목록에서 고른다).
       그래도 아래 숫자는 차종을 타므로, 어느 차 기준인지 문장에 밝혀둔다.
       안 밝히면 "30L는 어디서 나온 숫자지?" 하고 걸린다. */
    var by = (car.label || '일반 승용차') + ' 기준 ';

    if (s.sp >= big) {
      head = r.r + '는 주유소를 고를 가치가 큽니다';
      body = '같은 ' + OIL.esc(r.r) + ' 안에서 ' + fuelName + ' 최저 ' + OIL.won(s.lo) +
        '원, 최고 ' + OIL.won(s.hi) + '원으로 <b>' + OIL.won(s.sp) + '원</b> 차이가 납니다. ' +
        by + '한 번에 ' + L + 'L를 넣는다면 <b>' + OIL.won(saved) + '원</b>이 갈립니다. ' +
        '아무 데나 들어가면 손해를 보는 동네입니다.';
    } else if (s.sp < small) {
      var perKm = s.md / kmpl;
      var beKm = perKm > 0 ? saved / perKm : 0;
      head = r.r + '는 어디서 넣어도 비슷합니다';
      body = '동네 안에서 가장 싼 곳과 가장 비싼 곳의 차이가 <b>' + OIL.won(s.sp) +
        '원</b>뿐입니다. ' + by + '제일 싼 집을 찾아가더라도 <b>' + beKm.toFixed(1) +
        'km</b>만 더 돌면 아낀 돈이 기름값으로 사라집니다. 가는 길에 보이는 곳에서 넣으시면 됩니다.';
    } else {
      head = r.r + '는 조금 따져볼 만합니다';
      body = '동네 안 ' + fuelName + ' 가격 차이가 <b>' + OIL.won(s.sp) + '원</b>입니다. ' +
        by + L + 'L면 ' + OIL.won(saved) + '원 차이라, 멀리 돌아갈 정도는 아니지만 ' +
        '가는 길에 싼 곳이 있다면 들를 만합니다.';
    }

    var natMed = meta ? ((OIL.prefs && OIL.prefs.get('fuel') === 'd')
      ? meta.diesel.median : meta.gas.median) : s.md;
    var diff = s.md - natMed;
    var nat;
    if (Math.abs(diff) < 5) {
      nat = '전국 중앙값과 거의 같은 수준입니다 (전국 ' + total + '개 시군구 중 ' + s.rk + '번째로 저렴).';
    } else if (diff < 0) {
      nat = '전국 중앙값보다 <b>' + OIL.won(-diff) + '원 저렴</b>한 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + s.rk + '번째).';
    } else {
      nat = '전국 중앙값보다 <b>' + OIL.won(diff) + '원 비싼</b> 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + s.rk + '번째로 저렴).';
    }
    return { head: head, body: body, nat: nat };
  };

  OIL.characterLine = function (r) {
    if (!r.ac) {
      return '이 동네에는 1년 내내 최저권을 지킨 주유소가 없습니다. ' +
        '오늘 싼 곳이 다음 달에도 싸다는 보장이 없으니, 넣기 전에 매번 확인하는 편이 낫습니다.';
    }
    if (r.ac === 1) {
      return '이 동네에서 1년 내내 최저권을 지킨 주유소는 <b>단 한 곳</b>입니다. ' +
        '오늘 하루 싼 집과 계속 싼 집은 다릅니다.';
    }
    return '1년 내내 최저권을 지킨 주유소가 <b>' + r.ac + '곳</b> 있습니다. ' +
      '반대로 1년 내내 비싼 축이었던 곳도 ' + r.ap + '곳입니다.';
  };

  OIL.chev = function (color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
      (color || '#5B666A') + '" stroke-width="2.5" aria-hidden="true">' +
      '<path d="M9 6l6 6-6 6"></path></svg>';
  };
})();
