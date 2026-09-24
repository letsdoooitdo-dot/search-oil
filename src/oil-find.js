/* 주유소찾기 - 첫 화면(분기)과 장소 검색 화면

   첫 화면은 기능 두 개만 둔다.
     1) 장소명 검색  -> 그 장소 주변 주유소
     2) 내 주변      -> 현재 위치 주변 주유소
   둘 다 출발점만 다를 뿐 같은 결과 화면으로 간다.

   검색 화면은 페이지를 바꾸지 않고 덮는다. 휴대폰 뒤로가기로 닫히도록
   history 에 한 칸 넣어둔다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'find') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, PL = OIL.place;

  /* 목적지 화면에서 "출발지를 정해주세요"로 되돌아온 경우 */
  var pickOrigin = OIL.param('pick') === 'origin' && OIL.param('dla') && OIL.param('dln');

  var PIN = '<svg class="oil-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"></path>' +
    '<circle cx="12" cy="10" r="2.4"></circle></svg>';

  /* ── 첫 화면 ─────────────────────────────────────────────── */
  function renderFind(meta, reg) {
    /* 전에 내 위치를 찾아둔 적이 있으면 그 동네 가격을 미리 보여준다 */
    var lastSlug = P ? P.get('last') : '';
    var spot = P ? P.get('spot') : '';
    var near = null;
    if (lastSlug) {
      for (var i = 0; i < reg.items.length; i++) {
        if (reg.items[i].sl === lastSlug) { near = reg.items[i]; break; }
      }
    }

    var html = '<div class="oil-find">';

    /* 광고는 화면 제일 위, 소개상자보다 앞에 둔다(2026-09-23).
       다른 화면(계산기·동네·글)도 전부 맨 위라, 자리를 하나로 맞춘다. */
    html += OIL.adSlotHtml('top');

    /* 0. 주장을 숫자로 증명하는 자리.
       "제일 싼 주유소가 제일 이득일까요?" 와 "다 따져서 제일 싼 주유소를
       찾아드립니다" 는 머리 띠가 이미 말한다. 여기서 또 쓰면 같은 말을
       세 번 읽히게 되므로, 남겨둔 건 띠가 못 하는 일 - 숫자로 보여주기뿐이다.
       화면에 보이는 첫 문장이라 h1 을 여기 둔다(검색용 제목). */
    if (!pickOrigin) {
      /* 여기 숫자는 우리 계산기에 그대로 넣어도 같은 답이 나와야 한다.
         리터당 30원 싸고 10km 더 가는 경우는 경차·일반·SUV·화물 모두 손해다
         (기름값이 리터당 1,080원 아래로 떨어지지 않는 한 뒤집히지 않는다). */
      html += '<section class="oil-pitch">' +
        /* 이 상자가 무슨 상자인지 한마디로 말해준다. 이게 없으면
           갑자기 산수 문제가 튀어나온 것처럼 보인다. */
        '<span class="oil-pitch-tag">쓰면 좋은 이유!</span>' +
        '<h1 class="oil-pitch-q">리터당 <b>30원 싼 집</b>이 <b>10km</b> 멀다면,<br>' +
          '가는 게 맞을까요?</h1>' +
        '<div class="oil-pitch-calc">' +
          '<div class="oil-pitch-row"><span>싼 집 가서 아끼는 돈</span>' +
            '<b>900원</b></div>' +
          '<div class="oil-pitch-row is-cost"><span>더 멀리 가느라 드는 돈</span>' +
            '<b>1,500원</b></div>' +
        '</div>' +
        '<p class="oil-pitch-say"><b>다 따져서 제일 싼 주유소</b> 찾아드립니다.</p>' +
        '</section>';
    }

    /* 1. 내 주변. 지난번 결과가 있으면 오늘 가격으로 다시 계산해 미리 보여준다.
       자리는 먼저 잡아두고, 계산이 끝나면 채운다(기다리게 하지 않는다).
       ★ 가는 길보다 위에 둔다(2026-09-23). 목적지를 정해 검색하는 것보다
         "지금 내 주변"이 훨씬 자주 쓰는 길이다.
       출발지를 고르러 온 경우에는 아예 그리지 않는다 - 출발지를 묻는 화면에
       주변 주유소 찾기가 같이 떠 있으면 무엇을 하라는 화면인지 알 수 없다. */
    if (!pickOrigin) {
      html += '<section class="oil-find-sec">' +
        '<h2 class="oil-find-h"><span>내 주변에서 ' +
          '<b>다 따져서 제일 싼 주유소</b></span></h2>' +
        '<button type="button" class="oil-near-btn" id="oil-near">' +
          '<span class="oil-near-l">' + PIN +
            '<span><span class="oil-near-t">내 주변 다 따져서 제일 싼 주유소</span>' +
            '<span id="oil-near-sub"><span class="oil-near-where">' +
            (spot ? esc(spot) + ' 기준으로 찾아드립니다'
                  : '위치를 켜면 바로 찾아드립니다') +
            '</span></span></span></span>' +
          OIL.chev('#fff') +
        '</button>' +
        '<p class="oil-find-hint">따지는 항목 : 기름값 · 실제 이동거리 · 편도/왕복<br>' +
          '차종별 연비와 1회 주유량까지 따져서 계산합니다</p>' +
        '<div class="oil-locate-msg" id="oil-locate-msg"></div>' +
        '</section>';
    }
    void near;

    /* 2. 목적지까지 가는 길에서 찾기 */
    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h"><span>' +
        (pickOrigin ? '출발지를 정해주세요'
                    : '가는 길에서 <b>다 따져서 제일 싼 주유소</b>') + '</span></h2>' +
      '<button type="button" class="oil-fakein" id="oil-open-search">' +
        '<span>' + (pickOrigin ? '어디서 출발하세요?' : '어디로 가세요?') + '</span>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>' +
        '<path d="M20 20l-3.5-3.5"></path></svg>' +
      '</button>' +
      /* 무엇을 따지는지 그대로 적는다. 이 목록이 우리가 다른 점 전부다.
         두 메뉴의 목록이 다른 건, 가는 길은 '우회거리'를 재고
         내 주변은 '편도/왕복'을 묻기 때문이다 - 없는 걸 적으면 안 된다. */
      '<p class="oil-find-hint">' + (pickOrigin
        ? esc(OIL.param('dq')) + '까지 가는 길에서 찾아드립니다'
        : '따지는 항목 : 기름값 · 실제 이동거리 · 우회거리<br>' +
          '차종별 연비와 1회 주유량까지 따져서 계산합니다') +
      '</p></section>';

    html += '</div>';

    OIL.render(html);
    document.title = '주유소찾기 - 내 주변 기름값 싼 주유소';

    document.getElementById('oil-open-search')
      .addEventListener('click', function () { openSheet(); });
    /* 출발지 고르기 화면에는 이 버튼이 없다 */
    var nearBtn = document.getElementById('oil-near');
    if (nearBtn) nearBtn.addEventListener('click', goNear);
    showLastPick();
  }

  /* 지난번에 찾은 주유소를 오늘 가격으로 다시 계산해 버튼에 보여준다.
     길찾기는 부르지 않는다 - 거리는 그때 재둔 값을 그대로 쓴다.
     가격이 바뀌어 오늘은 손해라면 그렇게 말한다. 지난번 숫자를 그대로
     보여주면 들어가서 다른 답을 보게 된다. */
  function showLastPick() {
    var box = document.getElementById('oil-near-sub');
    var last = PL && PL.last();
    if (!box || !last || !last.top || !last.base) return;

    var slugs = last.top.sl === last.base.sl ? [last.top.sl] : [last.top.sl, last.base.sl];
    Promise.all(slugs.map(function (sl) { return OIL.region(sl); })).then(function (regs) {
      function find(want) {
        for (var i = 0; i < regs.length; i++) {
          var list = regs[i].stations || [];
          for (var j = 0; j < list.length; j++) {
            if (list[j].n === want.n) return list[j];
          }
        }
        return null;
      }
      var top = find(last.top), base = find(last.base);
      if (!top || !base) return;      /* 문 닫았거나 이름이 바뀌었다 */

      var f = P ? P.get('fuel') : 'g';
      var tp = f === 'd' ? top.d : top.g;
      var bp = f === 'd' ? base.d : base.g;
      if (!tp || !bp) return;         /* 오늘 그 유종을 안 판다 */

      var t = OIL.calcTrip(tp, bp, last.top.km, last.base.km, P && P.isRound());
      box.innerHTML = t.net > 0
        ? '<span class="oil-near-price"><b>' + esc(top.n) + '</b> ' +
          won(t.net) + '원 이득</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · ' +
          last.top.km.toFixed(1) + 'km · 지난번 결과</span>'
        : '<span class="oil-near-price">오늘은 <b>가까운 곳</b>이 낫습니다</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · 지난번 결과</span>';
    }).catch(function () { /* 못 불러오면 원래 안내문 그대로 둔다 */ });
  }

  /* ── 내 주변 - 위치를 받아서 결과 화면으로 ──────────────────
     두 번 시도한다.
       1차  빠른 방식(기지국·와이파이). 대개 1초 안에 온다.
       2차  1차가 시간 초과일 때만, GPS 를 켜고 더 기다린다.
     한 번만 해보고 포기하면 "오래 걸립니다"가 억울하게 뜬다 - 실내에서
     첫 시도가 자주 늦는데, GPS 로 다시 하면 되는 경우가 많다.

     ★ 실패 코드를 뭉뚱그리지 않는다. 전에는 거부(1)가 아니면 전부
       "오래 걸립니다"라고 했는데, 실제로 흔한 건 2번(위치를 못 구함)이다.
       PC 는 위치 장치가 없어 인터넷 주소로 어림잡는데 그게 자주 실패한다.
       "오래 걸린다"고 하면 기다리면 될 줄 알고 계속 눌러보게 된다. */
  function goNear() {
    var btn = document.getElementById('oil-near');
    var msg = document.getElementById('oil-locate-msg');
    if (!navigator.geolocation) { locateFailed('none'); return; }
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '위치를 확인하는 중...';

    /* 이미 거부해둔 상태면 8초를 기다릴 이유가 없다. 바로 알려준다. */
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
        if (st.state === 'denied') { if (btn) btn.disabled = false; locateFailed('deny'); }
        else tryLocate(false);
      }).catch(function () { tryLocate(false); });
    } else {
      tryLocate(false);
    }
  }

  function tryLocate(gps) {
    var btn = document.getElementById('oil-near');
    var msg = document.getElementById('oil-locate-msg');
    var app = inAppName();

    /* 앱 안 브라우저는 기다려도 안 된다. 21초(6+15)를 세워두지 않고
       5초만 보고 바로 빠져나오는 길을 안내한다. GPS 재시도도 안 한다. */
    var opt = app
      ? { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      : gps
        /* 2차 - 위성을 쓴다. 오래 걸리는 대신 실내에서도 잡히는 일이 있다.
           갓 받은 값만 받으려고 maximumAge 를 0 으로 둔다. */
        ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        /* 1차 - 기지국·와이파이로 충분하다. 우리는 반경 몇 km 안을 찾는
           일이라 정밀도가 필요 없고, 조금 전 받아둔 값이 있으면 그대로 쓴다. */
        : { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 };

    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, ln = pos.coords.longitude;
      location.href = (OIL.cfg.areaPageUrl || '/p/area.html') +
        '?la=' + la.toFixed(5) + '&ln=' + ln.toFixed(5) + '&me=1';
    }, function (err) {
      var code = err ? err.code : 0;
      /* 시간 초과면 GPS 로 한 번 더. 그 외(거부·못 구함)는 다시 해도 같다. */
      if (!gps && !app && code === 3) {
        if (msg) msg.textContent = 'GPS로 한 번 더 잡아보는 중... (최대 15초)';
        tryLocate(true);
        return;
      }
      if (btn) btn.disabled = false;
      locateFailed(code === 1 ? 'deny' : code === 2 ? 'unavail' : 'slow');
    }, opt);
  }

  /* ── 위치를 못 잡았을 때 ───────────────────────────────────
     한 줄 안내만 남기면 막다른 길이 된다. 여기서 할 수 있는 일을
     두 개 다 손에 쥐여준다 - (1) 동네 이름으로 찾기 (2) 다시 시도.
     권한을 거부한 사람에게는 어디를 눌러 켜는지도 기기에 맞춰 알려준다.
     "설정에서 허용해주세요"만으로는 설정 어디인지 못 찾는다. */
  /* 우리 화면이 남의 사이트 안에 끼워져 있는가(iframe).
     끼워진 화면에는 브라우저가 위치를 아예 안 내준다 - 바깥 사이트가
     allow="geolocation" 을 붙여주지 않으면 권한 거부로 떨어진다.
     내려받기 차단 등으로 window.top 을 읽다 막히면 그것도 남의 집이다. */
  function inFrame() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }

  /* 앱 안에 들어 있는 브라우저(인앱 브라우저)인가.
     인스타·스레드·카톡 등에서 링크를 누르면 이게 열리는데, 위치를 앱이
     대신 받아야 해서 막히는 경우가 많다. 이때는 "브라우저로 열기"가 답이다. */
  function inAppName() {
    var ua = navigator.userAgent || '';
    /* ★ 안드로이드 스레드는 UA 에 'Threads' 가 아니라 'Barcelona' 로 적힌다
       (스레드의 개발 시절 이름). 이것 때문에 스레드에서 들어온 사람을
       못 알아보고 엉뚱한 안내를 보여줬다(2026-09-24). */
    if (/Barcelona|Threads/i.test(ua)) return '스레드';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return '페이스북';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/NAVER\(inapp|NAVER\//i.test(ua)) return '네이버 앱';
    if (/Line\//i.test(ua)) return '라인';
    if (/DaumApps/i.test(ua)) return '다음 앱';
    if (/everytimeApp|BAND|TwitterAndroid|Snapchat/i.test(ua)) return '앱 안 브라우저';
    return '';
  }

  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }

  /* 안드로이드에서 앱 안 브라우저를 빠져나와 크롬으로 여는 주소.
     아이폰에는 이런 방법이 없다 - 애플이 막아놔서 손으로 [브라우저로 열기]를
     골라주는 수밖에 없다. */
  function chromeIntent() {
    var bare = location.href.replace(/^https?:\/\//, '');
    return 'intent://' + bare + '#Intent;scheme=https;package=com.android.chrome;' +
      'S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
  }

  function allowHint() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return '아이폰은 <b>설정 → 개인정보 보호 및 보안 → 위치 서비스</b>를 켜고, ' +
             '그 안에서 <b>Safari 웹사이트</b>(크롬을 쓰시면 <b>Chrome</b>)를 ' +
             '<b>앱을 사용하는 동안</b>으로 바꿔주세요. 그다음 이 화면을 새로고침하시면 됩니다.';
    }
    if (/Android/i.test(ua)) {
      return '주소창 왼쪽 <b>자물쇠</b>를 누르고 <b>권한 → 위치</b>를 ' +
             '<b>허용</b>으로 바꾼 뒤, 아래 [위치 다시 시도]를 눌러주세요.';
    }
    return '주소창 왼쪽 <b>자물쇠</b>를 누르고 <b>위치</b>를 <b>허용</b>으로 바꾼 뒤, ' +
           '아래 [위치 다시 시도]를 눌러주세요.';
  }

  function locateFailed(kind) {
    var msg = document.getElementById('oil-locate-msg');
    if (!msg) return;

    /* 왜 막혔는지부터 갈라본다. 남의 사이트 안이거나 앱 안 브라우저면
       "설정에서 위치를 켜세요"는 소용이 없다 - 거기서는 켤 수가 없다.
       빠져나오는 길을 알려주는 게 유일한 답이다. */
    var app = inAppName();
    var head, why, extra = '';

    if (inFrame()) {
      head = '이 화면은 다른 사이트 안에 들어 있습니다';
      why = '끼워 넣어진 화면에는 브라우저가 위치를 내주지 않습니다. ' +
            '아래 <b>새 창에서 열기</b>를 누르면 바로 됩니다.';
      extra = '<button type="button" class="oil-locate" id="oil-near-newwin">' +
              '새 창에서 열기</button>';
    } else if (app && isAndroid()) {
      /* 안드로이드는 말로 안내할 필요가 없다. intent:// 로 크롬을 직접
         열 수 있어서 버튼 한 번이면 끝난다. 크롬이 없으면 아무 일도 일어나지
         않으므로 fallback 주소를 같이 실어 보통 브라우저로라도 열리게 한다. */
      head = app + ' 안에서 열려 위치를 못 씁니다';
      why = '앱이 품고 있는 작은 브라우저는 위치를 잘 내주지 않습니다 — ' +
            '거부한다고 말해주지도 않고 <b>그냥 늘어지는</b> 경우가 많아, ' +
            '기다려도 끝나지 않습니다. 아래를 누르면 크롬으로 열립니다.';
      extra = '<a class="oil-locate" href="' + chromeIntent() + '">' +
              '크롬으로 열기</a>';
    } else if (app) {
      /* ★ 거부일 때만 이 안내를 띄우다가 놓쳤다(2026-09-24). 앱 안
         브라우저는 대놓고 거부하는 대신 **아무 답도 안 주고 늘어지는**
         경우가 더 많다 - 그래서 "오래 걸립니다"로 떨어졌고, 사용자는
         기다리면 될 줄 알고 계속 눌렀다. 앱 안이면 이유를 안 가리고
         빠져나오는 길부터 알려준다. */
      head = app + ' 안에서 열려 위치를 못 씁니다';
      why = '앱이 품고 있는 작은 브라우저는 위치를 잘 내주지 않습니다 — ' +
            '거부한다고 말해주지도 않고 <b>그냥 늘어지는</b> 경우가 많아, ' +
            '기다려도 끝나지 않습니다.<br>' +
            '오른쪽 위 <b>⋯</b>(또는 <b>⋮</b>)를 눌러 ' +
            '<b>다른 브라우저로 열기</b>를 골라주세요. 크롬·사파리에서 열면 됩니다.';
    } else if (kind === 'none') {
      head = '이 브라우저는 위치 기능을 쓸 수 없습니다';
      why = '아래에서 동네나 장소 이름으로 찾아주세요.';
    } else if (kind === 'deny') {
      head = '위치 권한이 꺼져 있습니다';
      why = allowHint();
    } else if (kind === 'unavail') {
      /* 제일 흔한 실패인데 전에는 "오래 걸립니다"로 덮여 있었다.
         기다린다고 되는 게 아니라는 걸 분명히 말해준다. */
      head = '위치를 찾지 못했습니다';
      why = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        ? '기기가 위치를 내주지 못했습니다. <b>휴대폰 설정에서 위치(GPS)</b>가 ' +
          '꺼져 있지 않은지 보시고, 그래도 안 되면 아래에서 동네 이름으로 찾아주세요.'
        : '<b>컴퓨터는 위치 장치가 없어</b> 인터넷 주소로 어림잡는데, 그게 자주 ' +
          '실패합니다. 기다린다고 되지는 않습니다 — 휴대폰에서는 대개 잡히고, ' +
          '지금은 아래에서 <b>동네 이름으로 찾으시면 결과는 똑같습니다.</b>';
    } else {
      head = '위치 확인이 오래 걸립니다';
      why = 'GPS로 한 번 더 해봤는데도 시간이 넘었습니다. ' +
            '실내나 지하에서 자주 그렇습니다. ' +
            '다시 시도하거나, 동네 이름으로 바로 찾으셔도 됩니다.';
    }

    /* 어떤 경우든 '동네 이름으로 찾기'는 준다. 이 길만 있으면 위치 없이도
       똑같은 결과를 볼 수 있다 - 막다른 길로 끝내지 않는다. */
    msg.innerHTML =
      '<div class="oil-locate-help">' +
        '<b>' + head + '</b>' +
        '<p>' + why + '</p>' + extra +
        '<button type="button" class="oil-locate' + (extra ? ' is-ghost' : '') +
          '" id="oil-near-search">동네·장소 이름으로 찾기</button>' +
        (kind === 'none' ? '' :
          '<button type="button" class="oil-locate is-ghost" id="oil-near-retry">' +
            '위치 다시 시도</button>') +
      '</div>';

    var w = document.getElementById('oil-near-newwin');
    if (w) {
      w.addEventListener('click', function () {
        window.open(location.href, '_blank', 'noopener');
      });
    }
    var s = document.getElementById('oil-near-search');
    if (s) s.addEventListener('click', function () { openSheet('near'); });
    var r = document.getElementById('oil-near-retry');
    if (r) r.addEventListener('click', goNear);
  }

  /* ── 검색 화면 ───────────────────────────────────────────── */
  var sheet = null, input = null, body = null;
  var timer = null, seq = 0;

  /* 같은 검색 화면을 세 가지로 쓴다. 고른 곳을 어디로 넘길지가 다르다.
       dest    목적지로     - 가는 길에서 찾기
       origin  출발지로     - 목적지는 정했는데 출발지를 모를 때
       near    그 지점 주변 - 위치를 못 잡아 '내 주변' 대신 쓰는 길 */
  var sheetMode = 'dest';

  function openSheet(mode) {
    if (!sheet) buildSheet();
    sheetMode = mode || (pickOrigin ? 'origin' : 'dest');
    sheet.classList.add('is-open');
    document.body.classList.add('oil-noscroll');
    input.value = '';
    input.placeholder = sheetMode === 'near'
      ? '동네나 장소 이름을 넣어주세요'
      : '장소명을 검색해 주세요';
    drawIdle();
    /* 휴대폰 뒤로가기로 닫히게 한 칸 넣어둔다 */
    try { history.pushState({ oilSheet: 1 }, '', location.href); } catch (e) { }
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeSheet(fromPop) {
    if (!sheet || !sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    document.body.classList.remove('oil-noscroll');
    if (!fromPop) {
      try { if (history.state && history.state.oilSheet) history.back(); } catch (e) { }
    }
  }

  window.addEventListener('popstate', function () { closeSheet(true); });

  function buildSheet() {
    sheet = document.createElement('div');
    sheet.className = 'oil-sheet';
    sheet.innerHTML =
      '<div class="oil-sheet-bar">' +
        '<button type="button" class="oil-sheet-ico" id="oil-sheet-back" aria-label="닫기">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2"><path d="M15 6l-6 6 6 6"></path></svg></button>' +
        '<input class="oil-sheet-in" id="oil-sheet-in" type="search" ' +
          'placeholder="장소명을 검색해 주세요" autocomplete="off" ' +
          'enterkeyhint="search" aria-label="장소 검색">' +
        '<button type="button" class="oil-sheet-ico" id="oil-sheet-clear" aria-label="지우기">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>' +
      '</div><div class="oil-sheet-body" id="oil-sheet-body"></div>';
    document.body.appendChild(sheet);

    input = sheet.querySelector('#oil-sheet-in');
    body = sheet.querySelector('#oil-sheet-body');

    sheet.querySelector('#oil-sheet-back').addEventListener('click', function () { closeSheet(); });
    sheet.querySelector('#oil-sheet-clear').addEventListener('click', function () {
      input.value = ''; drawIdle(); input.focus();
    });

    /* 타이핑이 멈추고 0.3초 뒤에 찾는다 - 글자마다 부르지 않는다 */
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (!q) { drawIdle(); return; }
      timer = setTimeout(function () { doSearch(q); }, 300);
    });

    body.addEventListener('click', onBodyClick);
  }

  /* 검색어가 없을 때 - 최근 검색만 보여준다 */
  function drawIdle() {
    var html = '';
    var rec = PL.recent();
    html += '<div class="oil-sheet-head"><span>최근 검색</span>' +
      (rec.length ? '<button type="button" class="oil-sheet-clearall" id="oil-clearall">' +
        '검색기록 전체 삭제</button>' : '') + '</div>';

    if (!rec.length) {
      html += '<div class="oil-sheet-empty">최근 검색한 장소가 없습니다</div>';
    } else {
      html += '<div class="oil-hits">' + rec.map(function (p, i) {
        return '<div class="oil-hit"><button type="button" class="oil-hit-go" data-go=\'' +
          esc(JSON.stringify(p)) + '\'>' + PIN + '<span><b>' + esc(p.n) + '</b>' +
          (p.a ? '<i>' + esc(p.a) + '</i>' : '') + '</span></button>' +
          '<button type="button" class="oil-hit-x" data-forget="' + i +
          '" aria-label="삭제">✕</button></div>';
      }).join('') + '</div>';
    }
    body.innerHTML = html;
  }

  function doSearch(q) {
    var my = ++seq;
    body.innerHTML = '<div class="oil-sheet-empty">찾는 중...</div>';
    PL.search(q).then(function (list) {
      if (my !== seq) return;      /* 그 사이 더 친 글자가 있으면 버린다 */
      if (!list.length) {
        body.innerHTML = '<div class="oil-sheet-empty">검색 결과가 없습니다<br>' +
          '<span>동네 이름(예: 평택, 불당동)으로도 찾을 수 있습니다</span></div>';
        return;
      }
      body.innerHTML = '<div class="oil-sheet-head"><span>검색 결과</span></div>' +
        '<div class="oil-hits">' + list.map(function (p) {
          return '<div class="oil-hit"><button type="button" class="oil-hit-go" data-go=\'' +
            esc(JSON.stringify(p)) + '\'>' + PIN + '<span><b>' + esc(p.n) + '</b>' +
            (p.a ? '<i>' + esc(p.a) + '</i>' : '') + '</span></button></div>';
        }).join('') + '</div>';
    });
  }

  function onBodyClick(e) {
    var t = e.target;

    var clearAll = t.closest('#oil-clearall');
    if (clearAll) { PL.clearRecent(); drawIdle(); return; }

    var forget = t.closest('[data-forget]');
    if (forget) { PL.forget(+forget.getAttribute('data-forget')); drawIdle(); return; }

    var go = t.closest('[data-go]');
    if (go) {
      var p;
      try { p = JSON.parse(go.getAttribute('data-go')); } catch (err) { return; }
      if (sheetMode === 'origin') {
        /* 고른 곳은 목적지가 아니라 출발지다 */
        location.href = PL.destUrl(
          { la: parseFloat(OIL.param('dla')), ln: parseFloat(OIL.param('dln')),
            n: OIL.param('dq') }, p);
        return;
      }
      PL.remember(p);
      /* near - 위치를 못 잡았을 때. 고른 곳을 '내 위치' 대신 쓴다. */
      location.href = sheetMode === 'near' ? PL.nearUrl(p) : PL.destUrl(p);
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { renderFind(a[0], a[1]); })
    .catch(OIL.fail);
})();
