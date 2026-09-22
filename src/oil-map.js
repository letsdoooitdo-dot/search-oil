/* 주유소찾기 - 목록 위에 붙는 지도

   목록에 보이는 주유소를 그대로 지도에 찍는다. 조건(반경·유종 등)을 바꾸면
   목록이 바뀌고 지도도 같이 바뀐다.

   오피넷은 '싼 순서'로 색을 칠하지만 우리는 **이득이 나느냐**로 칠한다.
   그게 이 서비스가 하는 말이고, 지도만 봐도 어느 쪽으로 가야 하는지 보인다.

   반경을 원으로 그리지는 않는다. 우리 반경은 도로거리인데 원은 직선이라
   실제와 어긋난 그림이 되기 때문이다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;

  var M = OIL.map = {};

  M.can = function () { return !!(OIL.place && OIL.place.hasKakao()); };

  function tag(cls, text) {
    var el = document.createElement('span');
    el.className = 'oil-mk ' + cls;
    if (text) el.textContent = text;
    return el;
  }

  /* el     지도를 그릴 자리
     o.from {la, ln, name}            출발지
     o.to   {la, ln, name}            목적지 (목적지 모드에서만)
     o.path [{la, ln}]                경로 (목적지 모드에서만)
     o.items [{la, ln, name, label, good, i}]  목록에 보이는 주유소
     o.onPick(i)                      마커를 눌렀을 때
  */
  M.render = function (el, o) {
    if (!el || !M.can()) return;
    if (el.getAttribute('data-ready')) return;
    el.setAttribute('data-ready', '1');
    el.innerHTML = '<div class="oil-st-map-msg">지도를 불러오는 중...</div>';

    OIL.place.sdk().then(function (kakao) {
      el.innerHTML = '';
      var from = new kakao.maps.LatLng(o.from.la, o.from.ln);
      var map = new kakao.maps.Map(el, { center: from, level: 6 });

      var bounds = new kakao.maps.LatLngBounds();
      bounds.extend(from);

      /* 목적지 모드: 실제 경로를 그대로 그린다 */
      if (o.path && o.path.length > 1) {
        var line = o.path.map(function (p) {
          return new kakao.maps.LatLng(p.la, p.ln);
        });
        new kakao.maps.Polyline({
          map: map, path: line, strokeWeight: 6,
          strokeColor: '#13181A', strokeOpacity: 0.75
        });
        /* 경로 전체가 아니라 우리가 찾은 구간만 화면에 담는다 */
        line.forEach(function (p) { bounds.extend(p); });
      }

      /* 목록에 보이는 곳은 5곳뿐이라 전부 이름표를 달 수 있다.
         이름표에는 목록과 같은 순위 번호, 상표 배지, 가격을 넣는다 -
         지도에서 본 표시를 아래 목록에서 그대로 찾을 수 있어야 한다.
         1위만 붉게 칠해 어디로 갈지 한눈에 보이게 한다. */
      (o.items || []).forEach(function (it, n) {
        var pos = new kakao.maps.LatLng(it.la, it.ln);
        bounds.extend(pos);
        var el2 = document.createElement('span');
        el2.className = 'oil-mk ' + (it.rank === 1 ? 'is-first' : 'is-good');
        el2.innerHTML = '<i class="oil-mk-no">' + (it.rank || n + 1) + '</i>' +
          (it.brand !== undefined ? OIL.brandChip(it.brand, 'is-mk') : '') +
          '<b>' + OIL.esc(it.label) + '</b>';
        el2.title = it.name;
        if (o.onPick) {
          el2.addEventListener('click', function (e) {
            e.stopPropagation();
            o.onPick(it.i);
          });
        }
        new kakao.maps.CustomOverlay({
          map: map, position: pos, content: el2, clickable: true,
          /* 주유소는 점 위쪽에 - 출발·도착 표시와 위아래로 갈라놓는다 */
          yAnchor: 1.35,
          /* 1위가 다른 표시에 가리지 않게 맨 위로 올린다 */
          zIndex: it.rank === 1 ? 150 : (100 - n)
        });
      });

      /* 출발·도착은 점 아래쪽에 단다 */
      new kakao.maps.CustomOverlay({
        map: map, position: from, yAnchor: -0.25, zIndex: 200,
        content: tag('is-from', o.from.name || '출발')
      });

      if (o.to) {
        var toPos = new kakao.maps.LatLng(o.to.la, o.to.ln);
        bounds.extend(toPos);
        new kakao.maps.CustomOverlay({ map: map, position: toPos, yAnchor: -0.25,
          zIndex: 200, content: tag('is-to', o.to.name || '도착') });
      }

      function fit() { map.relayout(); map.setBounds(bounds, 42, 30, 30, 30); }
      fit();
      /* 막 만든 자리는 크기를 잘못 잡는 경우가 있다 */
      setTimeout(fit, 80);
    }).catch(function () {
      el.innerHTML = '<div class="oil-st-map-msg">지도를 불러오지 못했습니다</div>';
    });
  };

  /* 마커를 눌렀을 때 그 카드로 내려가며 잠깐 표시해준다 */
  M.focusCard = function (i) {
    var cards = document.querySelectorAll('.oil-st');
    var card = cards[i];
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('is-lit');
    setTimeout(function () { card.classList.remove('is-lit'); }, 1600);
  };
})();
