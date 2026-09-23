/* ============================================================
   main.js — 공통 동작 + 사례 목록 필터 + 문의 링크 조립
   ------------------------------------------------------------
   ▶ 이 파일은 '보조'입니다.
     내비게이션·본문·사례 카드·사례 상세는 전부 정적 HTML 로 이미 들어 있습니다.
     자바스크립트가 꺼져도 페이지는 읽히고 모든 링크는 크롤링됩니다.
     여기서 하는 일은 세 가지뿐입니다 — 모바일 메뉴, 사례 목록 필터, 문의 링크 조립.
   ▶ 사례 데이터(cases-index.js)는 목록 페이지에서만 읽습니다.
   ▶ 의존성 없음. 번들러 없음.
   ============================================================ */
(function () {
  'use strict';

  /* 하위 폴더(service/, case/, guide/)에서도 경로가 맞도록 body[data-root] 를 씁니다. */
  var ROOT = (document.body && document.body.getAttribute('data-root')) || '';

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pad3(n) { return String(n).padStart(3, '0'); }

  /* 증거 유형 표기 — build.js 의 EVIDENCE_LABEL 과 같은 값을 씁니다.
     시공사례·납품사례·교체/유지보수 사례를 한 목록에서 구분하기 위한 것입니다.
     기술자료(가이드)는 이 목록에 들어오지 않습니다 — guide/ 로 따로 있습니다. */
  var EVIDENCE_LABEL = { '시공': '시공', '납품': '납품', '유지보수': '교체·유지보수' };

  /* ── 헤더 · 푸터 ──────────────────────────────────────── */
  function initChrome() {
    var toggle = document.querySelector('.nav-toggle');
    var gnb = document.getElementById('gnb');
    if (toggle && gnb) {
      toggle.addEventListener('click', function () {
        var open = gnb.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        /* 메뉴가 열리면 헤더가 어두운 오버레이 위에 놓입니다.
           로고가 검정 그대로면 배경에 묻히므로 헤더에도 상태를 알립니다. */
        var header = document.querySelector('.site-header');
        if (header) header.classList.toggle('is-nav-open', open);
      });
    }
    var year = document.querySelector('[data-year]');
    if (year) year.textContent = new Date().getFullYear();
  }

  /* ── 스크롤 등장 ──────────────────────────────────────────
     .reveal 은 CSS 에서 opacity:0 으로 시작합니다. 관찰자가 없으면
     내용이 영영 보이지 않으므로, 지원하지 않는 브라우저에서는
     즉시 모두 보이게 합니다. */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  /* ── 사례 카드 (빌드가 심는 것과 같은 모양) ───────────── */
  function caseCard(c) {
    var href = ROOT + 'case/' + pad3(c.id) + '-' + c.slug + '.html';
    var dir = ROOT + 'assets/images/cases/' + pad3(c.id) + '/';
    var fig = c.representative
      ? '<img src="' + dir + c.representative.replace(/(\.[a-z]+)$/i, '-thumb$1') +
        '" alt="' + esc(c.title) + ' 시공 후 모습" width="773" height="580" loading="lazy" decoding="async">'
      : '<div class="noimg">사진 준비 중</div>';

    var badges = [];
    badges.push('<span class="badge badge--evidence">' +
      esc(EVIDENCE_LABEL[c.evidenceType] || '시공') + '</span>');
    if (c.region) badges.push('<span class="badge badge--region">' + esc(c.region) + '</span>');
    var cust = c.customerLabel || c.customerType;
    if (cust) badges.push('<span class="badge badge--customer">' + esc(cust) + '</span>');
    (c.workType || []).forEach(function (w) {
      badges.push('<span class="badge badge--work">' + esc(w) + '</span>');
    });

    return '<a class="card card-link case-card" href="' + href + '">' +
      '<figure>' + fig + '</figure><div class="body">' +
      (badges.length ? '<div class="badges">' + badges.join('') + '</div>' : '') +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p>' + esc(c.excerpt) + '…</p>' +
      '<span class="card-more">사례 자세히 보기 →</span></div></a>';
  }

  /* ── 사례 목록 (필터 · 검색) ──────────────────────────
     초기 화면은 빌드가 심어 둔 정적 카드입니다.
     사용자가 필터를 건드릴 때만 다시 그립니다. */
  function initCasesPage() {
    var grid = document.getElementById('caseGrid');
    if (!grid || typeof CASE_INDEX === 'undefined') return;

    var all = CASE_INDEX; // 정렬은 빌드 시점에 이미 적용됨
    var state = { evidence: '', service: '', work: '', q: '' };

    function matches(c) {
      if (state.evidence && (c.evidenceType || '시공') !== state.evidence) return false;
      if (state.service && c.primaryService !== state.service &&
        (c.relatedServices || []).indexOf(state.service) < 0) return false;
      if (state.work && (c.workType || []).indexOf(state.work) < 0) return false;
      if (state.q) {
        var hay = [c.title, c.facilityType, c.excerpt, (c.tags || []).join(' '),
          c.regionDetail, c.customerLabel].join(' ').toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    }

    /** 특정 필터 값을 골랐을 때 남는 건수 (칩에 표시) */
    function countIf(key, val) {
      var saved = state[key];
      state[key] = val;
      var n = all.filter(matches).length;
      state[key] = saved;
      return n;
    }

    function buildChips(group) {
      var key = group.getAttribute('data-filter');
      var values = JSON.parse(group.getAttribute('data-values'));
      var box = group.querySelector('.chips');
      box.innerHTML = '';

      [{ v: '', l: '전체' }].concat(values.map(function (v) {
        return { v: v.value !== undefined ? v.value : v, l: v.label !== undefined ? v.label : v };
      })).forEach(function (opt) {
        var n = countIf(key, opt.v);
        var active = state[key] === opt.v;
        var btn = el('button', {
          type: 'button', class: 'chip', 'aria-pressed': active ? 'true' : 'false',
          disabled: (n === 0 && !active) ? 'disabled' : null
        }, esc(opt.l) + '<span class="n">' + n + '</span>');
        btn.addEventListener('click', function () {
          state[key] = active ? '' : opt.v;
          render();
        });
        box.appendChild(btn);
      });
    }

    function render() {
      document.querySelectorAll('[data-filter]').forEach(buildChips);
      var hit = all.filter(matches);
      var count = document.getElementById('caseCount');
      if (count) {
        count.textContent = '사례 ' + hit.length + '건' +
          (hit.length !== all.length ? ' (전체 ' + all.length + '건 중)' : '');
      }
      grid.innerHTML = hit.map(caseCard).join('') ||
        '<p class="note">조건에 맞는 사례가 없습니다. 위 필터를 해제해 보세요.</p>';
    }

    var search = document.getElementById('caseSearch');
    if (search) {
      search.addEventListener('input', function () { state.q = search.value.trim(); render(); });
    }

    /* 칩과 건수만 먼저 만들고, 카드는 정적 HTML 그대로 둡니다 */
    document.querySelectorAll('[data-filter]').forEach(buildChips);
    var count = document.getElementById('caseCount');
    if (count) count.textContent = '시공사례 ' + all.length + '건';
  }

  /* ── 토목자재 목록 (검색 · 카테고리) ─────────────────────
     카드는 빌드가 정적으로 심어 둡니다. 여기서는 숨기고 보이기만 합니다.
     스크립트가 없으면 칩은 같은 페이지의 카테고리 앵커로 동작합니다. */
  function initMaterials() {
    var input = document.getElementById('matSearch');
    var chips = document.getElementById('matChips');
    if (!input || !chips) return;
    var cards = document.querySelectorAll('.mat-card[data-cat]');
    var secs = document.querySelectorAll('[data-cat-sec]');
    var count = document.getElementById('matCount');
    var empty = document.getElementById('matEmpty');
    var state = { cat: '', q: '' };

    function render() {
      var q = state.q.toLowerCase().replace(/\s+/g, '');
      var shown = 0;
      Array.prototype.forEach.call(cards, function (c) {
        var ok = (!state.cat || c.getAttribute('data-cat') === state.cat) &&
          (!q || (c.getAttribute('data-q') || '').replace(/\s+/g, '').indexOf(q) >= 0);
        c.hidden = !ok;
        if (ok) shown++;
      });
      Array.prototype.forEach.call(secs, function (s) {
        s.hidden = !s.querySelector('.mat-card:not([hidden])');
      });
      Array.prototype.forEach.call(chips.querySelectorAll('.chip'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-cat') === state.cat ? 'true' : 'false');
      });
      if (count) count.textContent = '상품 ' + shown + '개' + (shown !== cards.length ? ' (전체 ' + cards.length + '개 중)' : '');
      if (empty) empty.hidden = shown !== 0;
    }

    chips.addEventListener('click', function (e) {
      var a = e.target.closest('.chip');
      if (!a) return;
      e.preventDefault();
      var v = a.getAttribute('data-cat') || '';
      state.cat = (state.cat === v) ? '' : v;
      render();
    });
    input.addEventListener('input', function () { state.q = input.value.trim(); render(); });
  }

  /* ── 견적문의 ─────────────────────────────────────────────
     buildInquiry()  입력 → 제목·본문 조립 (메일·복사·온라인 접수가 함께 씀)
     postInquiry()   온라인 접수 (config.js CONTACT_CHANNELS.formEndpoint 가 있을 때)
     mailtoHref()    메일 앱 방식 (온라인 접수가 없거나 실패했을 때)
  ─────────────────────────────────────────────────────────── */
  function buildInquiry(form) {
    var get = function (n) { var f = form.elements[n]; return f ? f.value.trim() : ''; };
    var type = get('type') || 'quote';
    var meta = INQUIRY_TYPES[type] || INQUIRY_TYPES.quote;
    return {
      type: type,
      subject: meta.subject,
      body: [
        '문의 유형: ' + meta.label,
        '기관/업체명: ' + get('org'),
        '담당자: ' + get('name'),
        '연락처: ' + get('phone'),
        '현장 위치(제주도 내): ' + get('place'),
        '시설/자재: ' + get('facility'),
        '수량: ' + get('qty'),
        '',
        '내용:',
        get('message'),
        '',
        '※ 현장 사진 1~2장을 이 메일에 첨부해 주시면 개략 견적이 더 정확해집니다.'
      ].join('\n')
    };
  }

  /* 메일 앱으로 보내기 — 온라인 접수가 없거나 실패했을 때의 대안 */
  function mailtoHref(inq) {
    return 'mailto:' + COMPANY.email + '?subject=' + encodeURIComponent(inq.subject) + '&body=' + encodeURIComponent(inq.body);
  }

  /* 온라인 접수 — config.js 의 CONTACT_CHANNELS.formEndpoint 로 전송합니다.
     성공은 서비스가 "받았다"고 응답했을 때만 인정합니다 (HTTP 2xx + ok/success).
     그 외(오류 응답·시간 초과·네트워크 오류)는 모두 실패로 처리하고 입력 내용을 그대로 둡니다. */
  function postInquiry(inq, form) {
    var ch = CONTACT_CHANNELS;
    var get = function (n) { var f = form.elements[n]; return f ? f.value.trim() : ''; };
    var payload = {
      subject: inq.subject,
      '문의 유형': (INQUIRY_TYPES[inq.type] || INQUIRY_TYPES.quote).label,
      '기관/업체명': get('org'), '담당자': get('name'), '연락처': get('phone'),
      '현장 위치': get('place'), '시설/자재': get('facility'), '수량': get('qty'), '내용': get('message'),
      botcheck: get('botcheck')
    };
    if (ch.formProvider === 'web3forms') { payload.access_key = ch.formAccessKey; payload.from_name = '제주안전시설 견적문의'; }
    if (ch.formProvider === 'formspree') { payload._subject = inq.subject; payload._gotcha = payload.botcheck; delete payload.botcheck; }
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(ch.formEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (timer) clearTimeout(timer);
        if (res.ok && (j.ok === true || j.success === true)) return true;
        throw new Error('rejected ' + res.status);
      });
    }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }

  /* ── 견적문의 폼 ─────────────────────────────────────────── */
  var DRAFT_KEY = 'jejusafety-inquiry-draft';
  var DRAFT_FIELDS = ['type', 'org', 'name', 'phone', 'place', 'facility', 'qty', 'message'];
  function saveDraft(form) {
    try {
      var d = {};
      DRAFT_FIELDS.forEach(function (n) { if (form.elements[n]) d[n] = form.elements[n].value; });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) { /* 저장할 수 없는 환경 — 무시 */ }
  }
  function loadDraft(form) {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d) return;
      DRAFT_FIELDS.forEach(function (n) { if (form.elements[n] && d[n]) form.elements[n].value = d[n]; });
    } catch (e) { /* 무시 */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ } }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, bad) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) ok(); else bad(); } catch (e) { bad(e); } finally { document.body.removeChild(ta); }
    });
  }

  function validate(form) {
    var get = function (n) { var f = form.elements[n]; return f ? f.value.trim() : ''; };
    var errs = [];
    if (!get('name')) errs.push(['name', '담당자 이름을 입력해 주세요.']);
    var phone = get('phone').replace(/[^\d]/g, '');
    if (!phone) errs.push(['phone', '연락처를 입력해 주세요.']);
    else if (phone.length < 9 || phone.length > 12) errs.push(['phone', '연락처를 확인해 주세요.']);
    if (!get('facility') && !get('message')) errs.push(['message', '시설/자재 또는 내용 중 하나를 입력해 주세요.']);
    if (form.elements.consent && !form.elements.consent.checked) errs.push(['consent', '개인정보 수집·이용에 동의해 주세요.']);
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
    errs.forEach(function (x) { if (form.elements[x[0]]) form.elements[x[0]].setAttribute('aria-invalid', 'true'); });
    return errs;
  }

  function initContact() {
    var form = document.getElementById('inquiryForm');
    if (!form) return;
    var status = document.getElementById('inquiryStatus');
    var submitBtn = document.getElementById('inquirySubmit');
    var online = form.getAttribute('data-mode') === 'online' && !!CONTACT_CHANNELS.formEndpoint;
    var submitLabel = submitBtn.textContent;

    function show(kind, html) { status.hidden = false; status.className = 'inq-status inq-status--' + kind; status.innerHTML = html; }

    /* 1) 이 기기에 남은 작성 중 내용을 되살리고  2) 상품 페이지에서 넘어온 값(유형·상품명)을 우선 적용 */
    loadDraft(form);
    var params = new URLSearchParams(location.search);
    var t = params.get('type');
    if (t && form.elements.type && form.elements.type.querySelector('option[value="' + t + '"]')) form.elements.type.value = t;
    var item = params.get('item');
    if (item && form.elements.facility) form.elements.facility.value = item.slice(0, 80);

    form.addEventListener('input', function () { saveDraft(form); });
    form.addEventListener('change', function () { saveDraft(form); });

    document.getElementById('inquiryCopy').addEventListener('click', function () {
      copyText(buildInquiry(form).body).then(function () {
        show('info', '문의 내용을 복사했습니다. 문자나 이메일(' + esc(COMPANY.email) + ')에 붙여 넣어 보내주세요.');
      }, function () { show('error', '복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.elements.botcheck && form.elements.botcheck.value) return;      // 스팸 봇
      var errs = validate(form);
      if (errs.length) {
        show('error', '<strong>입력을 확인해 주세요.</strong><br>' + errs.map(function (x) { return esc(x[1]); }).join('<br>'));
        var first = form.elements[errs[0][0]]; if (first) first.focus();
        return;
      }
      var inq = buildInquiry(form);
      if (!online) {                                                              // 메일 앱 방식
        saveDraft(form);
        show('info', '메일 앱을 여는 중입니다. 메일 앱이 열리지 않으면 <strong>내용 복사</strong> 후 전화(' + esc(COMPANY.tel) + ')·문자·이메일로 보내주세요. 작성한 내용은 이 기기에 남아 있습니다.');
        location.href = mailtoHref(inq);
        return;
      }
      submitBtn.disabled = true; submitBtn.textContent = '보내는 중…';
      show('info', '문의를 보내고 있습니다…');
      postInquiry(inq, form).then(function () {
        clearDraft();
        var keepType = form.elements.type.value;
        form.reset(); form.elements.type.value = keepType;
        show('success', '<strong>문의가 접수되었습니다.</strong> 담당자가 확인 후 연락드립니다. 급하시면 ' +
          '<a href="' + COMPANY.telHref + '">' + esc(COMPANY.tel) + '</a> 로 전화 주세요.');
      }, function () {
        saveDraft(form);
        show('error', '<strong>문의를 보내지 못했습니다.</strong> 입력하신 내용은 그대로 남아 있습니다.<br>' +
          '<button type="button" class="btn btn-safety inq-retry">다시 보내기</button> ' +
          '<a class="btn-ghost" href="' + esc(mailtoHref(inq)) + '">메일 앱으로 보내기</a> · ' +
          '<a class="btn-ghost" href="' + COMPANY.telHref + '">전화 ' + esc(COMPANY.tel) + '</a>');
        var retry = status.querySelector('.inq-retry');
        if (retry) retry.addEventListener('click', function () {
          if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
      }).then(function () { submitBtn.disabled = false; submitBtn.textContent = submitLabel; });
    });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function boot() {
    initChrome();
    initReveal();
    initCasesPage();
    initMaterials();
    if (typeof COMPANY !== 'undefined') initContact();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
