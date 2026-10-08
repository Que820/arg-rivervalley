/* ARG Framework · 通用运行时引擎
 * 与具体剧情无关：路由 / 存档 / 线索进度 / 条件判定 / 聊天 / 判词 / 结局。
 * 由 index.html 注入 window.ARG_STORY 后调用 ARG.boot()。
 */
(function () {
  'use strict';

  // ---------- 存档 ----------
  const DEFAULT_SAVE = { clues: [], revealed: [], flags: {}, verdict: null, combos: [], idleCount: 0, visited: [], solved: {} };

  function loadSave(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign({}, DEFAULT_SAVE, JSON.parse(raw)) : Object.assign({}, DEFAULT_SAVE);
    } catch (e) {
      return Object.assign({}, DEFAULT_SAVE);
    }
  }
  function persist() {
    try { localStorage.setItem(S.key, JSON.stringify(S.save)); } catch (e) { /* ignore */ }
  }

  // ---------- 全局会话 ----------
  let S = { story: null, key: '', save: null, nodes: {} };

  // ---------- 条件系统 ----------
  // requires: ["clueId"] 或 { clues:[], progressMin, progressMax, flag, flagNot }
  function evalRequires(req) {
    if (!req) return { ok: true };
    const list = Array.isArray(req) ? { clues: req } : req;
    const missing = [];
    (list.clues || []).forEach((c) => { if (!S.save.clues.includes(c)) missing.push(clueLabel(c)); });
    const fl = (f) => (S.story.meta.flagLabels || {})[f] || f;
    (list.flags || []).forEach((f) => { if (!S.save.flags[f]) missing.push('还差：' + fl(f)); });
    if (list.flag && !S.save.flags[list.flag]) missing.push('还差：' + fl(list.flag));
    if (list.flagNot && S.save.flags[list.flagNot]) missing.push('条件冲突：' + list.flagNot);
    const p = progress();
    if (list.progressMin != null && p < list.progressMin) missing.push('线索进度≥' + list.progressMin + '%');
    if (list.progressMax != null && p > list.progressMax) missing.push('线索进度≤' + list.progressMax + '%');
    return { ok: missing.length === 0, missing };
  }
  function clueLabel(id) { return (S.story.clues && S.story.clues[id]) || id; }
  function progress() {
    const total = Object.keys(S.story.clues || {}).length;
    return total ? Math.round((S.save.clues.length / total) * 100) : 0;
  }
  function collectClue(id) {
    if (id && S.story.clues && S.story.clues[id] && !S.save.clues.includes(id)) {
      S.save.clues.push(id);
      persist();
      toast(' 线索已记录：' + clueLabel(id) + '　·　调查回传已展开在下方');
    }
  }
  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('arg-toast');
    if (!t) {
      t = el('div', { id: 'arg-toast' }, []);
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 2600);
  }

  // ---------- 路由（hash） ----------
  function currentRoute() {
    const m = location.hash.match(/^#\/page\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : S.story.meta.start;
  }
  function go(nodeId) {
    if (location.hash === '#/page/' + nodeId) render();
    else location.hash = '#/page/' + nodeId;
  }
  window.addEventListener('hashchange', render);

  // ---------- 工具 ----------
  // 官方 counter-roll：数字滚动（StyleKit 代码驱动）
  function rollDigit(d, v, delay) {
    d.innerHTML = '';
    const inner = el('span', { class: 'counter-roll-digit' });
    inner.style.setProperty('--counter-target', String(v));
    inner.style.animationDelay = (delay || 0) + 'ms';
    const col = el('span', { class: 'counter-roll-column' });
    for (let i = 0; i <= 9; i++) col.appendChild(el('span', null, [String(i)]));
    inner.appendChild(col);
    d.appendChild(inner);
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (function flat(cs) { (cs || []).forEach((c) => {
      if (c == null) return;
      if (Array.isArray(c)) { flat(c); return; }
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }); })(children);
    return e;
  }
  // 正文富文本：[[线索id|关键词]] = 点击即「你」给罗伦萨下达调查指令，他回传调查结果并记录线索
  const openReports = {};
  function reportBox(id) {
    const node = S.nodes[id];
    if (!node) return null;
    const collapsed = openReports[id] === 'min';
    const box = el('div', { class: 'invest-report' + (collapsed ? ' collapsed' : '') });
    box.appendChild(el('div', { class: 'invest-cmd' }, ['【你 → 罗伦萨】去查「' + (node.reportLabel || node.title) + '」。']));
    if (node.mine) {
      box.appendChild(el('div', { class: 'invest-mine' }, [parasWithReports(node.mine)]));
    }
    const head = el('div', { class: 'invest-head' }, [
      '【罗伦萨 · 调查回传】' + (node.title || '') + '　',
      el('span', { class: 'invest-toggle' }, [collapsed ? '（展开）' : '（收起）']),
    ]);
    head.addEventListener('click', () => {
      openReports[id] = collapsed ? true : 'min'; persist(); render();
    });
    box.appendChild(head);
    if (!collapsed) {
      const body = el('div', { class: 'invest-body' });
      if (node.process) paras(node.process).forEach((x) => { x.className = 'invest-process-p'; body.appendChild(x); });
      paras(node.body).forEach((x) => body.appendChild(x));
      box.appendChild(body);
      box.appendChild(el('div', { class: 'invest-note dim' }, ['（关键词已记录：' + clueLabel(id) + '）']));
    }
    return box;
  }
  function renderRich(line, blockOut) {
    const parts = String(line).split(/(\[\[[^\]]+\]\])/);
    const frag = parts.map((p) => {
      const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
      if (!m) return p;
      const id = m[1], label = m[2];
      if ((PUZ_HIDE || []).indexOf(id) >= 0) return null;
      const got = S.save.clues.includes(id);
      const w = el('span', { class: 'kw-inline' + (got ? ' got' : ''), title: got ? '已记录 · 点击重看调查回传' : '点击：指示罗伦萨调查' }, [label]);
      w.addEventListener('click', () => {
        if (!S.save.clues.includes(id)) collectClue(id);
        openReports[id] = (openReports[id] === true) ? 'min' : true;
        persist();
        render();
      });
      return w;
    });
    if (blockOut) {
      parts.forEach((p) => {
        const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        if (m && openReports[m[1]]) blockOut.push(reportBox(m[1]));
      });
    }
    return frag;
  }
  function paras(text) {
    return String(text || '').split(/\n+/).filter((l) => l.trim()).map((l) => el('p', null, [renderRich(l)]));
  }
  // 带调查回传块的段落：指令结果展开在对应段落下方
  function parasWithReports(text) {
    const out = [];
    String(text || '').split(/\n+/).filter((l) => l.trim()).forEach((l) => {
      const blocks = [];
      out.push(el('p', null, [renderRich(l, blocks)]));
      blocks.forEach((b) => out.push(b));
    });
    return out;
  }
  function disabledHint(missing) {
    return ' ' + (missing || []).join('；');
  }

  // ---------- 侧栏 ----------
  function sidePanel(extra) {
    const p = progress();
    const clueItems = S.save.clues.map((c) => el('div', { class: 'kw' }, ['▪ ' + clueLabel(c)]));
    const clueList = clueItems.length ? [el('div', { class: 'kw-scroll' }, clueItems)] : clueItems;
    const suspects = (S.story.suspects || [])
      .map((s) => (typeof s === 'string' ? { name: s } : s))
      .filter((s) => !s.requires || evalRequires(s.requires).ok)
      .map((s) => el('div', { class: 'suspect' + (s.page ? ' clickable' : ''),
        onclick: s.page ? () => enter(s.page) : null },
        ['□ ' + s.name]));
    const suspectList = suspects.length ? suspects : [el('div', { class: 'dim' }, ['（暂无——证据指向谁，谁才会被列上来）'])];
    return el('aside', { class: 'rv-side' }, [
      el('h3', null, ['线索进度 ' + p + '%']),
      el('div', { class: 'bar' }, [el('div', { class: 'bar-fill', style: 'width:' + p + '%' })]),
      el('h3', null, ['已收集关键词 · ' + S.save.clues.length]),
      clueList.length ? clueList : [el('div', { class: 'dim' }, ['（暂无）'])],
      el('h3', null, ['嫌疑人']),
      suspectList,
      extra || null,
      el('div', { class: 'side-back' }, [el('a', { href: '#/page/' + S.story.meta.start }, ['« 返回工作台'])]),
      el('div', { class: 'side-theme' }, [el('a', { href: 'javascript:void(0)', onclick: () => {
        const root = document.documentElement;
        const mode = root.dataset.mode === 'dark' ? '' : 'dark';
        root.dataset.mode = mode;
        try { localStorage.setItem('arg-theme-mode', mode); } catch (e) {}
        this.textContent = mode === 'dark' ? '◐ 切换亮色终端' : '◐ 切换暗色终端';
      } }, [document.documentElement.dataset.mode === 'dark' ? '◐ 切换亮色终端' : '◐ 切换暗色终端'])]),
      el('div', { class: 'side-tools' }, [el('a', { href: 'save.html', target: '_blank' }, ['💾 存档导出 / 导入'])]),
      el('div', { class: 'side-tools' }, [el('a', { href: 'unlock.html', target: '_blank' }, ['🔓 全解锁存档'])]),
      el('div', { class: 'side-reset' }, [el('a', { href: 'javascript:void(0)', onclick: () => {
        if (confirm('确定要重置存档、从头开始调查吗？此操作不可撤销。')) window.ARG.reset();
      } }, ['↺ 重置存档（从头开始）'])]),
    ]);
  }

  // ---------- 渲染器们 ----------
  function nodeLinks(node) {
    const box = el('div', { class: 'links' });
    (node.links || []).forEach((l) => {
      if (l.hideRequires && !evalRequires(l.hideRequires).ok) return;
      const cond = evalRequires(l.requires);
      if (!cond.ok && l.hideIfLocked) return;
      if (cond.ok) {
        box.appendChild(el('div', { class: 'link-item' }, [
          el('a', { href: '#/page/' + l.to, onclick: (ev) => { ev.preventDefault(); if (l.setFlag) { S.save.flags[l.setFlag] = true; persist(); } enter(l.to); } }, [l.label]),
        ]));
      } else {
        box.appendChild(el('div', { class: 'link-item locked' }, [l.label + '　' + disabledHint(cond.missing)]));
      }
    });
    return box;
  }

  function enter(nodeId) {
    const node = S.nodes[nodeId];
    if (!node) return;
    collectClue(node.clue);
    if (node.type === 'login' && S.save.flags.loginUnlocked && node.success) { go(node.success); return; }
    go(nodeId);
  }

  function refreshSide() {
    const aside = document.querySelector('aside.rv-side');
    if (aside && aside.parentNode) aside.parentNode.replaceChild(sidePanel(), aside);
  }
  let PUZ_HIDE = [];
  function renderBrowse(node) {
    PUZ_HIDE = (node.puzzle && !S.save.solved[node.puzzle.id]) ? (node.puzzle.hideKws || []) : [];
    const out = parasWithReports(node.body);
    let locked = 0;
    (node.sections || []).forEach((sec) => {
      if (sec.requires && !evalRequires(sec.requires).ok) { locked++; return; }
      out.push(el('div', { class: 'card-sec' }, parasWithReports(sec.text)));
    });
    if (locked) {
      out.push(el('div', { class: 'card-locked' }, ['〔档案更新 × ' + locked + ' ：随调查进度解锁〕']));
    }
    if (node.puzzle) out.push(renderPuzzle(node)); // 解密置于全部内容之后、出口链接之前
    out.push(nodeLinks(node));
    return out;
  }

  function renderPuzzle(node) {
    const pz = node.puzzle;
    if (pz.requires && !evalRequires(pz.requires).ok) {
      return el('div', { class: 'card-sec puzzle-box locked' }, [
        el('div', { class: 'puzzle-title' }, ['【解密】' + pz.title]),
        el('p', { class: 'dim' }, ['〔装置处于待机，缺少输入依据。' + (pz.requiresHint || '先把相关的线索查清。') + '〕']),
      ]);
    }
    if (S.save.solved[pz.id]) {
      const okBox = [el('div', { class: 'puzzle-done' }, ['✔ ' + (pz.doneLabel || '已完成')])];
      (pz.success || '').split(/\n+/).filter(Boolean).forEach((l) => okBox.push(el('p', { class: 'puzzle-success-p' }, [l])));
      return el('div', { class: 'card-sec puzzle-box solved' }, okBox);
    }
    const wrap = [el('div', { class: 'puzzle-title' }, ['【解密】' + pz.title])];
    (pz.intro || '').split(/\n+/).filter(Boolean).forEach((l) => wrap.push(el('p', { class: 'puzzle-intro' }, [l])));
    const body = el('div', { class: 'puzzle-body' });
    const err = el('div', { class: 'puzzle-err dim' });
    wrap.push(body, err);
    const fail = (m) => {
      err.textContent = m;
      const box = err.closest('.puzzle-box');
      if (box) { box.classList.remove('anim-shake'); void box.offsetWidth; box.classList.add('anim-shake'); }
    };
    const solve = () => {
      S.save.solved[pz.id] = true;
      (pz.reward || []).forEach((c) => collectClue(c));
      persist(); refreshSide(); render();
    };
    if (pz.kind === 'tune') {
      const val = el('span', { class: 'puzzle-readout' }, [(pz.min / (pz.scale || 1)).toFixed(1) + ' ' + (pz.unit || '')]);
      const rng = el('input', { type: 'range', min: pz.min, max: pz.max, step: 1, value: pz.min, class: 'puzzle-range' });
      const fmt = (v) => (v / (pz.scale || 1)).toFixed(1);
      rng.addEventListener('input', () => { val.textContent = fmt(+rng.value) + ' ' + (pz.unit || ''); });
      const btn = el('button', { class: 'btn', onclick: () => {
        if (Math.abs(+rng.value - pz.target) <= (pz.tolerance || 0)) solve();
        else fail(pz.wrongHint || '只有沙沙声。再调。');
      } }, ['接收']);
      body.appendChild(el('div', { class: 'puzzle-row' }, [rng, val, btn]));
      if (pz.hint) body.appendChild(el('div', { class: 'dim puzzle-hint' }, ['提示：' + pz.hint]));
    } else if (pz.kind === 'order') {
      const order = pz.data.displayOrder || pz.data.items.map((_, i) => i);
      const items = order.map((src) => ({ t: pz.data.items[src], i: src }));
      const picked = new Array(items.length).fill(undefined);
      const nSlots = items.length;
      const poolEl = el('div', { class: 'puzzle-order' });
      const slotsEl = el('div', { class: 'puzzle-slots' });
      body.appendChild(slotsEl);
      body.appendChild(poolEl);
      body.appendChild(el('div', { class: 'dim puzzle-hint' }, ['拖动残像至编号槽位。错误的回忆将导致意识坍塌。']));

      const mkFrag = (src, fromSlot) => {
        const c = el('div', { class: 'puzzle-frag', 'data-src': String(src) }, [items.filter((x) => x.i === src)[0].t]);
        let dragging = false, pid = null, sx = 0, sy = 0, moved = false;
        const markOver = (ev, on) => {
          const t = document.elementFromPoint(ev.clientX, ev.clientY);
          const sl = t && t.closest ? t.closest('.puzzle-slot') : null;
          if (sl) sl.classList.toggle('drag-over', on && !sl.classList.contains('filled'));
          return sl;
        };
        c.addEventListener('pointerdown', (ev) => {
          dragging = true; moved = false; pid = ev.pointerId; sx = ev.clientX; sy = ev.clientY;
          try { c.setPointerCapture(pid); } catch (e) {}
          c.classList.add('dragging'); ev.preventDefault();
        });
        c.addEventListener('pointermove', (ev) => {
          if (!dragging || ev.pointerId !== pid) return;
          moved = true;
          c.style.transform = 'translate3d(' + (ev.clientX - sx) + 'px,' + (ev.clientY - sy) + 'px,0)';
          slotsEl.querySelectorAll('.puzzle-slot').forEach((sl) => sl.classList.remove('drag-over'));
          markOver(ev, true);
        });
        const finish = (ev) => {
          if (!dragging) return;
          dragging = false;
          c.classList.remove('dragging');
          c.style.transform = '';
          slotsEl.querySelectorAll('.puzzle-slot').forEach((sl) => sl.classList.remove('drag-over'));
          if (!moved) return; // 未拖动 → 交给 click 处理
          const t = document.elementFromPoint(ev.clientX, ev.clientY);
          const sl = t && t.closest ? t.closest('.puzzle-slot') : null;
          if (sl && !sl.classList.contains('filled')) {
            if (fromSlot >= 0) picked[fromSlot] = undefined;
            place(+c.getAttribute('data-src'), +sl.getAttribute('data-slot'));
          } else if (fromSlot >= 0) {
            picked[fromSlot] = undefined; // 拖出槽位 → 退回碎片池
            redraw();
          }
        };
        c.addEventListener('pointerup', finish);
        c.addEventListener('pointercancel', finish);
        c.addEventListener('click', () => {
          if (fromSlot >= 0) { picked[fromSlot] = undefined; redraw(); return; } // 点击槽内残像 → 取回
          const k = picked.indexOf(undefined);
          if (k >= 0) place(+c.getAttribute('data-src'), k);
        });
        return c;
      };

      const checkBtn = el('button', { class: 'btn puzzle-check' }, ['校验']);
      checkBtn.addEventListener('click', () => {
        if (picked.filter((v) => v !== undefined).length < nSlots) return;
        if (picked.join(',') === pz.data.items.map((_, i) => i).join(',')) solve();
        else { picked.fill(undefined); fail(pz.wrongHint || '残像散开了。时间轴逻辑断裂。重来。'); redraw(); }
      });
      body.appendChild(checkBtn);

      const place = (src, slot) => {
        picked[slot] = src;
        redraw();
      };

      const redraw = () => {
        checkBtn.disabled = picked.filter((v) => v !== undefined).length < nSlots;
        slotsEl.innerHTML = '';
        for (let k = 0; k < nSlots; k++) {
          const sl = el('div', { class: 'puzzle-slot', 'data-slot': String(k) }, [String(k + 1) + '.']);
          if (picked[k] !== undefined) {
            sl.classList.add('filled');
            sl.innerHTML = '';
            sl.appendChild(el('span', { class: 'puzzle-slot-no' }, [String(k + 1) + '. ']));
            sl.appendChild(mkFrag(picked[k], k));
          }
          slotsEl.appendChild(sl);
        }
        poolEl.innerHTML = '';
        items.filter((it) => picked.indexOf(it.i) < 0).forEach((it) => {
          poolEl.appendChild(mkFrag(it.i, -1));
        });
      };
      redraw();
    } else if (pz.kind === 'dials') {
      const n = pz.target.length;
      const vals = new Array(n).fill(0);
      const row = el('div', { class: 'puzzle-dials' });
      const digits = [];
      for (let k = 0; k < n; k++) {
        const d = el('span', { class: 'puzzle-digit' }, []);
        digits.push(d);
        rollDigit(d, 0, k * 150);
        const mk = (dir) => () => {
          vals[k] = (vals[k] + dir + 10) % 10;
          rollDigit(d, vals[k], 0);
          if (n >= 3) { // 相邻两位反向联动（咬合）
            const l = (k + n - 1) % n, r = (k + 1) % n;
            vals[l] = (vals[l] - dir + 10) % 10; rollDigit(digits[l], vals[l], 60);
            vals[r] = (vals[r] - dir + 10) % 10; rollDigit(digits[r], vals[r], 120);
          }
        };
        row.appendChild(el('div', { class: 'puzzle-dial' }, [
          el('button', { class: 'btn dial-btn', onclick: mk(1) }, ['▲']),
          d,
          el('button', { class: 'btn dial-btn', onclick: mk(-1) }, ['▼']),
        ]));
      }
      const btn = el('button', { class: 'btn', onclick: () => {
        if (vals.join('') === pz.target) solve();
        else fail(pz.wrongHint || '芯片没有反应。');
      } }, ['启动']);
      body.appendChild(el('div', { class: 'puzzle-row' }, [row, btn]));
      if (pz.hint) body.appendChild(el('div', { class: 'dim puzzle-hint' }, ['提示：' + pz.hint]));
    } else if (pz.kind === 'clock') {
      let hv = 0, mv = 0;
      const face = el('div', { class: 'puzzle-clockface' });
      const hourHand = el('div', { class: 'puzzle-hand hour' });
      const minHand = el('div', { class: 'puzzle-hand min' });
      const pin = el('div', { class: 'puzzle-hand-pin' });
      face.appendChild(hourHand); face.appendChild(minHand); face.appendChild(pin);
      const readout = el('div', { class: 'dim puzzle-clock-readout' }, ['00:00']);
      const up = () => {
        hourHand.style.transform = 'rotate(' + ((hv % 12) * 30 + mv * 0.5) + 'deg)';
        minHand.style.transform = 'rotate(' + (mv * 6) + 'deg)';
        readout.textContent = String(hv).padStart(2, '0') + ':' + String(mv).padStart(2, '0');
        err.textContent = ''; // 调整即刻清除上一次的报错
      };
      const row = el('div', { class: 'puzzle-row puzzle-clock' }, [
        el('div', { class: 'puzzle-dial' }, [
          el('button', { class: 'btn dial-btn', onclick: () => { hv = ((hv + 1) % 24 + 24) % 24; up(); } }, ['▲']),
          el('span', { class: 'dim dial-label' }, ['时']),
          el('button', { class: 'btn dial-btn', onclick: () => { hv = ((hv - 1) % 24 + 24) % 24; up(); } }, ['▼']),
        ]),
        face,
        el('div', { class: 'puzzle-dial' }, [
          el('button', { class: 'btn dial-btn', onclick: () => { mv = ((mv + 1) % 60 + 60) % 60; up(); } }, ['▲']),
          el('span', { class: 'dim dial-label' }, ['分']),
          el('button', { class: 'btn dial-btn', onclick: () => { mv = ((mv - 1) % 60 + 60) % 60; up(); } }, ['▼']),
        ]),
      ]);
      const wrapCol = el('div', { class: 'puzzle-clock-col' }, [row, readout]);
      const btn = el('button', { class: 'btn', onclick: () => {
        if (hv === pz.targetHour && mv === pz.targetMin) solve();
        else fail(pz.wrongHint || '定时器没响。时间不对。');
      } }, ['校准']);
      body.appendChild(el('div', { class: 'puzzle-row' }, [wrapCol, btn]));
      if (pz.hint) body.appendChild(el('div', { class: 'dim puzzle-hint' }, ['提示：' + pz.hint]));
    } else if (pz.kind === 'quiz') {
      (pz.data.options || []).forEach((op) => {
        const b = el('button', { class: 'btn quiz-opt', onclick: () => {
          if (op.ok) { solve(); if (pz.goto) enter(pz.goto); }
          else fail(op.hint || '这份陈述站不住脚。再想想。');
        } }, [op.text]);
        body.appendChild(b);
      });
      if (pz.hint) body.appendChild(el('div', { class: 'dim puzzle-hint' }, ['提示：' + pz.hint]));
    }
    return el('div', { class: 'card-sec puzzle-box' }, wrap);
  }

  function renderFiles(node) {
    const head = node.path ? el('div', { class: 'files-path' }, [node.path]) : null;
    const out = [head, ...paras(node.body)];
    (node.sections || []).forEach((sec) => {
      if (sec.requires && !evalRequires(sec.requires).ok) return;
      out.push.apply(out, paras(sec.text));
    });
    out.push(nodeLinks(node));
    return out;
  }

  function renderLogin(node) {
    const input = el('input', { type: 'password', placeholder: '输入密码…', class: 'pwd-input' });
    const err = el('div', { class: 'err' });
    const btn = el('button', { class: 'btn', onclick: () => {
      const norm = (v) => String(v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm(input.value) === norm(node.password)) {
        S.save.flags.loginUnlocked = true; persist();
        if (node.success) enter(node.success);
      } else err.textContent = node.wrongHint || '密码错误。';
    } }, ['解锁']);
    return [
      el('div', { class: 'login-box' }, [
        el('div', { class: 'login-title' }, [node.systemName || node.title]),
        node.hint ? el('div', { class: 'dim login-hint' }, [node.hint]) : null,
        input, el('div', { class: 'login-actions' }, [btn]), err,
      ]),
    ];
  }

  function renderChat(node) {
    const wrap = el('div', { class: 'chat-wrap' });
    const list = el('div', { class: 'contact-list' });
    const pane = el('div', { class: 'chat-pane' });
    wrap.appendChild(list); wrap.appendChild(pane);

    function show(contact) {
      pane.innerHTML = '';
      pane.appendChild(el('div', { class: 'chat-head' }, [
        el('b', null, [contact.avatar + ' ' + contact.name]),
        el('span', { class: 'dim' }, [contact.bio || '']),
      ]));
      const msgs = el('div', { class: 'chat-msgs' });
      (contact.messages || []).forEach((m) => msgs.appendChild(el('div', { class: 'bubble' }, [m.text])));
      // 已触发的选项回复在重渲染后回显
      (contact.options || []).forEach((o, i) => {
        const rkey = node.id + ':' + contact.name + ':' + i;
        if (S.save.revealed.includes(rkey) && o.reply && o.reply !== '……') {
          msgs.appendChild(el('div', { class: 'bubble reply' }, [o.reply]));
        }
      });
      pane.appendChild(msgs);
      (contact.options || []).forEach((o, i) => {
        if (o.hideRequires && !evalRequires(o.hideRequires).ok) return;
        const rkey = node.id + ':' + contact.name + ':' + i;
        const done = S.save.revealed.includes(rkey);
        const cond = evalRequires(o.requires);
        if (done || !cond.ok) return; // 未解锁的选项不显示；已点过的选项由回显气泡呈现
        const row = el('div', { class: 'chat-choice' });
        const btn = el('button', { class: 'btn' }, [o.text]);
        btn.addEventListener('click', () => {
          if (!S.save.revealed.includes(rkey)) { S.save.revealed.push(rkey); }
          if (o.clue) collectClue(o.clue);
          if (o.setFlag) { S.save.flags[o.setFlag] = true; persist(); }
          persist();
          refreshSide();
          if (o.to) enter(o.to); else show(contact); // 只刷新当前会话，展示新解锁的选项
        });
        row.appendChild(btn);
        pane.appendChild(row);
      });
    }

    (node.contacts || []).forEach((c, idx) => {
      const item = el('div', { class: 'contact-item', onclick: () => {
        list.querySelectorAll('.contact-item').forEach((x) => x.classList.remove('active'));
        item.classList.add('active');
        show(c);
      } }, [el('span', { class: 'avatar' }, [c.avatar]), el('span', null, [c.name])]);
      if (idx === 0) item.classList.add('active');
      list.appendChild(item);
    });
    if (node.contacts && node.contacts.length) show(node.contacts[0]);
    return [wrap];
  }

  // ---------- 搜索式沟通面板（聊天样式，仅输入触发） ----------
  function renderSearch(node) {
    const wrap = el('div', { class: 'chat-wrap search-chat' });
    const pane = el('div', { class: 'chat-pane' });
    wrap.appendChild(pane);

    pane.appendChild(el('div', { class: 'chat-head' }, [
      el('b', null, [' ' + (node.contactName || '罗伦萨')]),
      el('span', { class: 'dim' }, ['想问些什么就问——但他只回答有证据支撑的问题']),
    ]));

    const msgs = el('div', { class: 'chat-msgs' });
    pane.appendChild(msgs);

    const sysLine = (text) => msgs.appendChild(el('div', { class: 'dim chat-sys' }, [text]));
    function showResult(t, q) {
      msgs.appendChild(el('div', { class: 'bubble user' }, [t]));
      if (q) {
        msgs.appendChild(el('div', { class: 'bubble' }, [paras(q.reply)]));
        if (q.idea) msgs.appendChild(el('div', { class: 'bubble idea' }, [paras('（他的想法）' + q.idea)]));
      }
      msgs.scrollTop = msgs.scrollHeight;
    }
    function runQuery(t, q) {
      const rkey = node.id + ':' + q.term;
      if (!S.save.revealed.includes(rkey)) S.save.revealed.push(rkey);
      if (q.clue) collectClue(q.clue);
      if (q.setFlag) S.save.flags[q.setFlag] = true;
      persist();
      refreshSide();
      showResult(t, q);
    }
    function submit() {
      const t = input.value.trim();
      if (!t) return;
      input.value = '';
      const q = (node.queries || []).find((x) =>
        t.indexOf(x.term) >= 0 || x.term.indexOf(t) >= 0 ||
        (x.alias || []).some((a) => t.indexOf(a) >= 0 || a.indexOf(t) >= 0));
      if (!q || (q.hideRequires && !evalRequires(q.hideRequires).ok)) {
        // 未收录的词：按 idle 词条匹配人物/场景，给出罗伦萨的想法；否则轮换兜底想法
        const idle = (node.idle || []).find((x) =>
          (!x.requires || evalRequires(x.requires).ok) &&
          (x.match || []).some((m) => t.indexOf(m) >= 0 || m.indexOf(t) >= 0));
        msgs.appendChild(el('div', { class: 'bubble user' }, [t]));
        if (idle) {
          msgs.appendChild(el('div', { class: 'bubble' }, [paras(idle.idea)]));
        } else {
          const pool = node.fallbackIdeas || ['……频道那头沉默了几秒。换个词试试。'];
          const idea = pool[S.save.idleCount % pool.length];
          S.save.idleCount = (S.save.idleCount || 0) + 1; persist();
          msgs.appendChild(el('div', { class: 'bubble' }, [paras(idea)]));
        }
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }
      const miss = evalRequires(q.requires);
      if (!miss.ok) {
        msgs.appendChild(el('div', { class: 'bubble user' }, [t]));
        // 按实际缺失的条件选回应：初报未做时优先催初报，否则用词条专属/默认拒绝
        let reply;
        if ((q.requires.flags || []).indexOf('f_told') >= 0 && !S.save.flags.f_told) {
          reply = '「现场情况你还没跟我说。」罗伦萨打断你，「你看到了什么，先一条条报给我。」';
        } else {
          reply = q.lockedReply || node.defaultLockedReply || '「现在问这个还太早。」他顿了顿，「先把眼前的查清楚，再来问我。」';
        }
        msgs.appendChild(el('div', { class: 'bubble' }, [paras(reply)]));
        sysLine('（还差：' + miss.missing.join('；') + '）');
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }
      runQuery(t, q);
    }

    // 回显已触发过的查询（按剧情顺序）
    let openGreet = false;
    (node.queries || []).forEach((q) => {
      if (S.save.revealed.includes(node.id + ':' + q.term)) {
        if (!openGreet) { msgs.appendChild(el('div', { class: 'bubble' }, ['（频道已接通。他在等你提问。）'])); openGreet = true; }
        showResult(q.term, q);
      }
    });
    if (!openGreet) msgs.appendChild(el('div', { class: 'bubble' }, ['（频道已接通。他在等你提问。）']));

    const row = el('div', { class: 'chat-input-row' });
    const input = el('input', { type: 'text', class: 'chat-input', placeholder: '想问些什么…' });
    const btn = el('button', { class: 'btn' }, ['发送']);
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    row.appendChild(input); row.appendChild(btn);
    pane.appendChild(row);
    return [wrap];
  }

  function renderVerdict(node) {
    const cfg = node.verdict || S.story.verdictPage || {};
    const box = el('div', { class: 'verdict' });
    (cfg.intro || []).forEach((t) => {
      const text = typeof t === 'string' ? t : t.text;
      if (typeof t === 'object' && t.requires && !evalRequires(t.requires).ok) return;
      box.appendChild(el('p', null, [text]));
    });
    (cfg.choices || []).forEach((ch) => {
      const cond = evalRequires(ch.requires);
      const row = el('div', { class: 'verdict-choice' });
      const btn = el('button', { class: 'btn verdict-btn' }, [ch.label]);
      if (!cond.ok || S.save.verdict) btn.disabled = true;
      if (!cond.ok) return; // 前置不满足：隐藏选项，不显示锁提示
      btn.addEventListener('click', () => {
        if (S.save.verdict != null) return;
        let end = ch.ending;
        if (ch.endings) { // 同一判词按进度分流到不同结局
          for (const b of ch.endings) {
            if (!b.requires || evalRequires(b.requires).ok) { end = b.ending; break; }
          }
        }
        S.save.verdict = end; persist();
        enter(end);
      });
      row.appendChild(btn);
      box.appendChild(row);
    });
    if (S.save.verdict) {
      box.appendChild(el('p', { class: 'warn' }, ['※ 判词已提交，不可撤销。']));
      box.appendChild(el('a', { href: '#/page/' + S.save.verdict }, ['查看结局 »']));
    }
    return [box];
  }

  function renderEnding(node) {
    return [
      el('div', { class: 'ending-title' }, [node.title]),
      el('div', { class: 'ending-body' }, [paras(node.body)]),
    ];
  }

  // ---------- 关键词组合面板 ----------
  function nodeCombos(node) {
    const all = (S.story.combos || []).concat(node.combos || []);
    return all.filter((c) => !node.comboExclude || node.comboExclude.indexOf(c.id) === -1);
  }

  function renderComboPanel(node) {
    const combos = nodeCombos(node);
    if (!combos.length) return null;
    const owned = S.save.clues;
    const box = el('div', { class: 'combo-panel' });
    box.appendChild(el('h3', { class: 'combo-title' }, [' 关键词组合']));
    box.appendChild(el('div', { class: 'dim combo-hint' }, ['从已收集的关键词中选取两条进行组合。']));

    const chips = el('div', { class: 'combo-chips' });
    const selected = [];
    owned.forEach((c) => {
      const chip = el('button', { class: 'combo-chip' }, [clueLabel(c)]);
      chip.addEventListener('click', () => {
        const i = selected.indexOf(c);
        if (i >= 0) { selected.splice(i, 1); chip.classList.remove('active'); }
        else if (selected.length < 2) { selected.push(c); chip.classList.add('active'); }
      });
      chips.appendChild(chip);
    });
    //  组合罗盘：提示还有几组已集齐但未拼合的关键词
    const ready = combos.filter((c) => !S.save.combos.includes(c.id) && (c.keywords || []).every((k) => owned.includes(k))).length;
    box.appendChild(el('div', { class: 'dim combo-compass' }, [ready > 0
      ? ' 组合罗盘：你手里有 ' + ready + ' 组关键词看起来能拼在一起——选出它们，按下组合。'
      : ' 组合罗盘：暂无可拼合的组合。继续调查，关键词之间会自己认亲。']));
    box.appendChild(chips);

    const result = el('div', { class: 'combo-result' });
    const err = el('div', { class: 'dim combo-err' });
    const btn = el('button', { class: 'btn combo-btn' }, [' 尝试组合']);
    btn.addEventListener('click', () => {
      if (selected.length < 2) { err.textContent = '请先选取两个关键词。'; return; }
      err.textContent = '';
      const key = selected.slice().sort().join('+');
      const hit = combos.find((c) => key === (c.keywords || []).slice().sort().join('+') || (c.altKeywords && key === c.altKeywords.slice().sort().join('+')));
      if (!hit) { const hints = S.story.comboHints || {}; err.textContent = hints[key] || hints[selected.slice().sort().reverse().join('+')] || '这两个关键词之间没有发现任何联系……换个组合试试。'; return; }
      if (!S.save.combos.includes(hit.id)) {
        S.save.combos.push(hit.id); persist();
      }
      if (hit.clue) collectClue(hit.clue);
      if (hit.flag) { S.save.flags[hit.flag] = true; persist(); }
      result.innerHTML = '';
      const inner = el('div', { class: 'combo-result-inner' }, [
        el('div', { class: 'combo-result-title' }, [' 你的调查：' + (hit.title || '新的发现')]),
        (hit.steps || []).map((st) => el('div', { class: 'combo-step' }, ['▸ ' + st])),
        el('div', { class: 'combo-conclusion' }, [paras(hit.result)]),
        hit.to ? el('a', { href: '#/page/' + hit.to, onclick: (ev) => { ev.preventDefault(); enter(hit.to); } }, [' 前往：' + ((S.nodes[hit.to] || {}).title || hit.to)]) : null,
      ]);
      result.appendChild(inner);
      render();
    });
    box.appendChild(el('div', { class: 'combo-actions' }, [btn, err]));
    box.appendChild(result);

    // 已解开的组合在重渲染后回显
    combos.forEach((hit) => {
      if (S.save.combos.includes(hit.id)) {
        result.appendChild(el('div', { class: 'combo-result-inner done' }, [
          el('div', { class: 'combo-result-title' }, [' ' + (hit.title || '已解开的组合')]),
          paras(hit.result),
        ]));
      }
    });
    return box;
  }

  function renderWorkbench(node) {
    return [
      el('h2', { class: 'wb-title' }, [node.title]),
      paras(node.body),
      nodeLinks(node),
      renderComboPanel(node),
    ];
  }

  // ---------- 主渲染 ----------
  function render() {
    if (!S.story) return;
    const id = currentRoute();
    let node = S.nodes[id] || { type: '404', title: '404' };
    // forward：条件满足时自动渲染目标节点（如已进屋则不再落在门外）
    let guard = 0;
    while (node.forward && evalRequires(node.forward.requires).ok && S.nodes[node.forward.to] && guard++ < 5) {
      node = S.nodes[node.forward.to];
    }
    collectClue(node.clue);
    if (node.enterFlag && !S.save.flags[node.enterFlag]) { S.save.flags[node.enterFlag] = true; persist(); }
    if (node.lockRequires && !evalRequires(node.lockRequires).ok) {
      document.title = S.story.meta.title + ' · ' + (node.title || '');
      const root = document.getElementById('arg-root');
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'rv-shell' }, [
        el('header', { class: 'rv-titlebar' }, [(node.systemName || S.story.meta.systemName || S.story.meta.title) + ' — ' + (node.title || '')]),
        el('div', { class: 'rv-window' }, [el('div', { class: 'rv-main' }, [
          el('div', { class: 'login-box' }, [
            el('div', { class: 'login-title' }, [' ' + (node.title || '')]),
            el('div', { class: 'dim login-hint' }, ['权限不足：' + disabledHint(evalRequires(node.lockRequires).missing)]),
          ...((node.lockLinks || []).map((l) => el('a', { href: '#/page/' + l.to, class: 'login-link', style: 'display:block;margin-top:10px;' }, [' ' + l.label]))),

          ]),
        ]), sidePanel()]),
      ]));
      return;
    }
    document.title = node.title ? S.story.meta.title + ' · ' + node.title : S.story.meta.title;
    // 重访不重播入场动画：只有首次进入才播
    if (!S.save.visited) S.save.visited = [];
    const nid = node.id || id;
    const revisited = S.save.visited.indexOf(nid) !== -1;
    const main = el('div', { class: 'rv-main' + (revisited ? ' no-anim' : '') });
    if (revisited === false) { S.save.visited.push(nid); persist(); }
    let inner;
    switch (node.type) {
      case 'chat': inner = renderChat(node); break;
      case 'search': inner = renderSearch(node); break;
      case 'login': {
        if (node.requires && !evalRequires(node.requires).ok) {
          inner = [
            el('div', { class: 'login-box' }, [
              el('div', { class: 'login-title' }, [node.systemName || node.title]),
              el('div', { class: 'dim login-hint' }, [' 解密模块离线。' + disabledHint(evalRequires(node.requires).missing)]),
            ]),
          ];
        } else if (S.save.flags.loginUnlocked && node.success) {
          inner = [
            el('div', { class: 'login-box' }, [
              el('div', { class: 'login-title' }, [node.systemName || node.title]),
              el('div', { class: 'dim login-hint' }, [' 终端已解锁。']),
              el('div', { class: 'login-actions' }, [el('a', { href: '#/page/' + node.success, onclick: (ev) => { ev.preventDefault(); enter(node.success); } }, [' 进入' + ((S.nodes[node.success] || {}).title || '目标页面')])]),
            ]),
          ];
        } else {
          inner = renderLogin(node);
        }
        break;
      }
      case 'files': inner = renderFiles(node); break;
      case 'verdict': inner = renderVerdict(node); break;
      case 'ending': inner = renderEnding(node); break;
      case 'workbench': inner = renderWorkbench(node); break;
      case '404': inner = [el('p', null, ['无法显示该页（404 Not Found）'])]; break;
      default: inner = renderBrowse(node);
    }
    (function flatAppend(cs) { (cs || []).forEach((x) => {
      if (x == null) return;
      if (Array.isArray(x)) { flatAppend(x); return; }
      main.appendChild(x);
    }); })(inner);

    const root = document.getElementById('arg-root');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'rv-shell' }, [
      el('header', { class: 'rv-titlebar' }, [(node.systemName || S.story.meta.systemName || S.story.meta.title) + ' — ' + (node.title || '')]),
      el('div', { class: 'rv-window' }, [main, sidePanel()]),
    ]));
  }

  // ---------- 启动 ----------
  window.ARG = {
    boot: function () {
      S.story = window.ARG_STORY;
      S.key = S.story.meta.storageKey || 'arg-save-default';
      S.save = loadSave(S.key);
      S.nodes = {};
      (S.story.nodes || []).forEach((n) => { S.nodes[n.id] = n; });
      // 老存档回填：拼过的组合自动补旗标
      (S.story.combos || []).forEach((c) => {
        if (c.flag && S.save.combos && S.save.combos.includes(c.id) && !S.save.flags[c.flag]) { S.save.flags[c.flag] = true; }
      });
      if (!location.hash) location.hash = '#/page/' + S.story.meta.start;
      render();
    },
    reset: function () { localStorage.removeItem(S.key); location.hash = ''; location.reload(); },
  };
})();
