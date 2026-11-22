(function () {
  'use strict';

  var cfg = window.APP_CONFIG || {};
  var db = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  var $ = function (s, r) { return (r || document).querySelector(s); };

  // ---------- helpers ----------
  function el(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kids = [].concat(arguments[i]);
      kids.forEach(function (c) {
        if (c == null) return;
        n.append(c.nodeType ? c : document.createTextNode(c));
      });
    }
    return n;
  }
  var BN = '০১২৩৪৫৬৭৮৯';
  function toAscii(s) { return String(s || '').replace(/[০-৯]/g, function (d) { return BN.indexOf(d); }); }
  function bn(n) { return Number(n).toLocaleString('bn-BD'); }
  function cleanPhone(p) { return toAscii(p).replace(/[\s-]/g, ''); }
  function phoneOk(p) { return /^01[3-9]\d{8}$/.test(cleanPhone(p)); }
  function numOrNull(v) {
    var n = parseInt(toAscii(v).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function fill(select, items) {
    items.forEach(function (t) { select.append(el('option', { value: t, text: t })); });
  }
  function chips(container, items, name) {
    items.forEach(function (t) {
      container.append(el('label', {},
        el('input', { type: 'checkbox', name: name, value: t }),
        el('span', { text: t })));
    });
  }
  function checked(container) {
    return [].map.call(container.querySelectorAll('input:checked'), function (i) { return i.value; });
  }
  function setStatus(node, msg, ok) {
    node.textContent = msg;
    node.className = 'status ' + (ok ? 'ok' : 'err');
  }

  // ---------- demo data (শুধু ডেমো মোডে) ----------
  var DEMO_TUTORS = [
    { id: 'd1', name: 'রাকিব হাসান', institution: 'বেগম রোকেয়া বিশ্ববিদ্যালয়', subjects: ['গণিত', 'পদার্থবিজ্ঞান'], classes: ['ক্লাস ৬-৮', 'ক্লাস ৯-১০'], area: 'জাহাজ কোম্পানি মোড়', rate: 3000, bio: 'গণিত বুঝিয়ে পড়াই, সপ্তাহে ৩ দিন।' },
    { id: 'd2', name: 'তানিয়া আক্তার', institution: 'কারমাইকেল কলেজ', subjects: ['ইংরেজি', 'বাংলা'], classes: ['ক্লাস ১-৫', 'ক্লাস ৬-৮'], area: 'মডার্ন মোড়', rate: 2500, bio: '' },
    { id: 'd3', name: 'সাদিয়া ইসলাম', institution: 'রংপুর মেডিকেল কলেজ', subjects: ['জীববিজ্ঞান', 'রসায়ন'], classes: ['এইচএসসি', 'ভর্তি প্রস্তুতি'], area: 'শাপলা চত্বর', rate: 4000, bio: 'মেডিকেল ভর্তি প্রস্তুতিতে অভিজ্ঞ।' },
    { id: 'd4', name: 'মাহমুদুল হাসান', institution: 'বেগম রোকেয়া বিশ্ববিদ্যালয়', subjects: ['ICT', 'গণিত'], classes: ['ক্লাস ৯-১০', 'এইচএসসি'], area: 'কেল্লা', rate: 3500, bio: '' },
  ];
  var DEMO_POSTS = [
    { id: 'p1', class_level: 'ক্লাস ৯-১০', subject: 'গণিত', area: 'জাহাজ কোম্পানি মোড়', budget: 3000, note: 'সপ্তাহে ৩ দিন, সন্ধ্যায়।' },
    { id: 'p2', class_level: 'ক্লাস ১-৫', subject: 'সব বিষয়', area: 'সাতমাথা', budget: 2000, note: '' },
    { id: 'p3', class_level: 'এইচএসসি', subject: 'পদার্থবিজ্ঞান', area: 'মডার্ন মোড়', budget: 3500, note: 'ছাত্রী টিউটর হলে ভালো।' },
  ];

  // ---------- data layer ----------
  function localGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }
  function localAdd(key, row) {
    var arr = localGet(key);
    arr.push(Object.assign({}, row, { id: 'l' + Date.now(), created_at: new Date().toISOString() }));
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* ignore */ }
  }

  function getTutors() {
    if (!db) return Promise.resolve(DEMO_TUTORS);
    return db.from('tutors_public').select('*').order('created_at', { ascending: false })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function getPosts() {
    if (!db) {
      var mine = localGet('demo_tuition_posts').map(function (p) {
        return { id: p.id, class_level: p.class_level, subject: p.subject, area: p.area, budget: p.budget, note: p.note };
      });
      return Promise.resolve(mine.concat(DEMO_POSTS));
    }
    return db.from('tuition_posts_public').select('*').order('created_at', { ascending: false }).limit(30)
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function insertRow(table, row) {
    if (!db) { localAdd('demo_' + table, row); return Promise.resolve(); }
    return db.from(table).insert(row).then(function (r) { if (r.error) throw r.error; });
  }

  // ---------- state & render ----------
  var tutors = [];
  var filters = { cls: '', subject: '', area: '' };

  function tutorCard(t) {
    var initials = (t.name || '?').trim().slice(0, 2);
    var tags = [].concat(t.subjects || []).map(function (s) { return el('span', { class: 'tag green', text: s }); })
      .concat([].concat(t.classes || []).map(function (c) { return el('span', { class: 'tag', text: c }); }));
    var card = el('article', { class: 'card' },
      el('div', { class: 'tutor-top' },
        el('div', { class: 'avatar', 'aria-hidden': 'true', text: initials }),
        el('div', { class: 'who' },
          el('div', { class: 'name' }, t.name, db ? null : el('span', { class: 'sample', text: 'নমুনা' })),
          el('div', { class: 'inst', text: t.institution || '' })),
        el('div', { class: 'rate' }, '৳' + bn(t.rate || 0), el('small', { text: 'প্রতি মাস' }))),
      el('div', { class: 'tags' }, tags),
      t.bio ? el('p', { class: 'bio', text: t.bio }) : null,
      el('div', { class: 'card-foot' },
        el('span', { text: 'এলাকা: ' + (t.area || '') }),
        el('button', {
          type: 'button', class: 'btn small primary',
          'data-tutor': t.name
        }, 'ট্রায়াল ক্লাস চাই')));
    card.querySelector('button').addEventListener('click', function () {
      $('#rNote').value = 'পছন্দের টিউটর: ' + t.name;
      $('#request').scrollIntoView();
      $('#requestForm [name=guardian_name]').focus({ preventScroll: true });
    });
    return card;
  }

  function renderTutors() {
    var list = $('#tutorList');
    var shown = tutors.filter(function (t) {
      return (!filters.cls || (t.classes || []).indexOf(filters.cls) !== -1) &&
        (!filters.subject || (t.subjects || []).indexOf(filters.subject) !== -1 || (t.subjects || []).indexOf('সব বিষয়') !== -1) &&
        (!filters.area || t.area === filters.area);
    });
    list.replaceChildren();
    $('#tutorCount').textContent = bn(shown.length) + ' জন';
    if (!shown.length) {
      list.append(el('div', { class: 'empty', text: 'এই শর্তে কোনো টিউটর পাওয়া যায়নি। অন্য এলাকা বা বিষয় বেছে দেখুন, অথবা নিচে "টিউশন চাই" ফর্ম পূরণ করুন।' }));
      return;
    }
    shown.forEach(function (t) { list.append(tutorCard(t)); });
  }

  var applyPostId = null;
  function postCard(p) {
    var tags = [
      el('span', { class: 'tag green', text: p.class_level }),
      el('span', { class: 'tag green', text: p.subject }),
    ];
    var card = el('article', { class: 'card' },
      el('div', { class: 'tags' }, tags),
      p.note ? el('p', { class: 'bio', text: p.note }) : null,
      el('div', { class: 'card-foot' },
        el('span', { text: p.area + (p.budget ? ' · ৳' + bn(p.budget) : '') }),
        el('button', { type: 'button', class: 'btn small' }, 'আবেদন করুন')));
    card.querySelector('button').addEventListener('click', function () {
      applyPostId = p.id;
      $('#applyTitle').textContent = p.class_level + ', ' + p.subject + ' (' + p.area + ')';
      $('#applyStatus').textContent = '';
      $('#applyDialog').showModal();
    });
    return card;
  }

  function renderPosts(posts) {
    var list = $('#postList');
    list.replaceChildren();
    if (!posts.length) {
      list.append(el('div', { class: 'empty', text: 'এই মুহূর্তে কোনো খোলা টিউশন নেই।' }));
      return;
    }
    posts.forEach(function (p) { list.append(postCard(p)); });
  }

  function loadAll() {
    $('#tutorList').replaceChildren(el('div', { class: 'empty', text: 'লোড হচ্ছে…' }));
    getTutors().then(function (data) { tutors = data; renderTutors(); })
      .catch(function () {
        $('#tutorList').replaceChildren(el('div', { class: 'empty', text: 'টিউটরের তালিকা আনা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।' }));
      });
    getPosts().then(renderPosts)
      .catch(function () {
        $('#postList').replaceChildren(el('div', { class: 'empty', text: 'টিউশনের তালিকা আনা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।' }));
      });
  }

  // ---------- forms ----------
  function onRequest(e) {
    e.preventDefault();
    var f = e.target, st = $('#requestStatus');
    if (f.website.value) return; // spam trap
    var phone = cleanPhone(f.phone.value);
    if (!f.guardian_name.value.trim()) return setStatus(st, 'আপনার নাম লিখুন।', false);
    if (!phoneOk(phone)) return setStatus(st, 'সঠিক ফোন নম্বর দিন (যেমন 01XXXXXXXXX)।', false);
    if (!f.class_level.value || !f.subject.value || !f.area.value) return setStatus(st, 'ক্লাস, বিষয় ও এলাকা বাছাই করুন।', false);
    var btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    insertRow('tuition_posts', {
      guardian_name: f.guardian_name.value.trim(),
      phone: phone,
      class_level: f.class_level.value,
      subject: f.subject.value,
      area: f.area.value,
      budget: numOrNull(f.budget.value),
      note: f.note.value.trim() || null,
    }).then(function () {
      setStatus(st, 'আপনার টিউশন পোস্ট জমা হয়েছে। শীঘ্রই যোগাযোগ করা হবে।', true);
      f.reset();
      loadAll();
    }).catch(function () {
      setStatus(st, 'জমা দেওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।', false);
    }).then(function () { btn.disabled = false; });
  }

  function onJoin(e) {
    e.preventDefault();
    var f = e.target, st = $('#joinStatus');
    if (f.website.value) return;
    var phone = cleanPhone(f.phone.value);
    var subjects = checked($('#jSubjects')), classes = checked($('#jClasses'));
    var rate = numOrNull(f.rate.value);
    if (!f.name.value.trim() || !f.institution.value.trim()) return setStatus(st, 'নাম ও প্রতিষ্ঠান লিখুন।', false);
    if (!phoneOk(phone)) return setStatus(st, 'সঠিক ফোন নম্বর দিন (যেমন 01XXXXXXXXX)।', false);
    if (!subjects.length || !classes.length) return setStatus(st, 'অন্তত একটি বিষয় ও একটি ক্লাস বাছাই করুন।', false);
    if (!f.area.value) return setStatus(st, 'এলাকা বাছাই করুন।', false);
    if (!rate) return setStatus(st, 'প্রত্যাশিত মাসিক রেট লিখুন।', false);
    var btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    insertRow('tutors', {
      name: f.name.value.trim(),
      phone: phone,
      institution: f.institution.value.trim(),
      subjects: subjects,
      classes: classes,
      area: f.area.value,
      rate: rate,
      bio: f.bio.value.trim() || null,
      verified: false,
    }).then(function () {
      setStatus(st, 'আবেদন জমা হয়েছে। পরিচয় যাচাই শেষ হলে আপনার প্রোফাইল দেখানো হবে।', true);
      f.reset();
      f.querySelectorAll('.chips input').forEach(function (i) { i.checked = false; });
    }).catch(function () {
      setStatus(st, 'জমা দেওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।', false);
    }).then(function () { btn.disabled = false; });
  }

  function onApply(e) {
    e.preventDefault();
    var f = e.target, st = $('#applyStatus');
    var phone = cleanPhone(f.tutor_phone.value);
    if (!f.tutor_name.value.trim()) return setStatus(st, 'আপনার নাম লিখুন।', false);
    if (!phoneOk(phone)) return setStatus(st, 'সঠিক ফোন নম্বর দিন (যেমন 01XXXXXXXXX)।', false);
    insertRow('applications', {
      post_id: applyPostId,
      tutor_name: f.tutor_name.value.trim(),
      tutor_phone: phone,
    }).then(function () {
      setStatus(st, 'আবেদন পাঠানো হয়েছে।', true);
      setTimeout(function () { $('#applyDialog').close(); f.reset(); st.textContent = ''; }, 1200);
    }).catch(function () {
      setStatus(st, 'আবেদন পাঠানো যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।', false);
    });
  }

  // ---------- init ----------
  function init() {
    var AREAS = cfg.AREAS || [], BANDS = cfg.CLASS_BANDS || [], SUBJ = cfg.SUBJECTS || [];
    fill($('#fClass'), BANDS); fill($('#fSubject'), SUBJ); fill($('#fArea'), AREAS);
    fill($('#rClass'), BANDS); fill($('#rSubject'), SUBJ); fill($('#rArea'), AREAS);
    fill($('#jArea'), AREAS);
    chips($('#jSubjects'), SUBJ, 'subjects');
    chips($('#jClasses'), BANDS, 'classes');

    if (!db) $('#demoBanner').hidden = false;

    $('#searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      filters = { cls: $('#fClass').value, subject: $('#fSubject').value, area: $('#fArea').value };
      renderTutors();
      $('#tutors').scrollIntoView();
    });
    ['#fClass', '#fSubject', '#fArea'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        filters = { cls: $('#fClass').value, subject: $('#fSubject').value, area: $('#fArea').value };
        renderTutors();
      });
    });
    $('#requestForm').addEventListener('submit', onRequest);
    $('#joinForm').addEventListener('submit', onJoin);
    $('#applyForm').addEventListener('submit', onApply);
    $('#applyCancel').addEventListener('click', function () { $('#applyDialog').close(); });

    loadAll();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
