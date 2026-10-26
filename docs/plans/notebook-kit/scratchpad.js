/* Scratchpad kit (draft, canvas only). Ported into the Tudu Paper design system once the canvas is approved.
 * A note is personal: only its owner sees it, wherever it is linked. Notes live in folders (three levels deep at most) and
 * link to any number of tasks, in any space. Everything here uses the system's own pieces (Icon, IconButton, Button,
 * RichTextEditor, SpaceTile, Skeleton, EmptyState, Banner, FilterField, Menu) and its tokens. */
(function () {
  var React = window.React, ReactDOM = window.ReactDOM, h = React.createElement;
  var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;
  var TP = window.TuduPaper;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function svg(size, kids, sw) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw || 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, kids); }
  function paths(list) { return list.map(function (d, i) { return h('path', { key: i, d: d }); }); }

  // New icons (lucide): NotebookPen for a note, Folder, FolderPlus, Pin, Maximize2 / Minimize2, GripHorizontal.
  var PI = {
    pad: paths(['M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4', 'M2 6h4', 'M2 10h4', 'M2 14h4', 'M2 18h4', 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z']),
    folder: paths(['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']),
    putBack: paths(['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11']),
    folderPlus: paths(['M12 10v6', 'M9 13h6', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']),
    pin: paths(['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z']),
    expand: paths(['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7']),
    shrink: paths(['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7']),
    chev: paths(['m9 18 6-6-6-6']),
    task: [h('circle', { key: 1, cx: 12, cy: 12, r: 9 })]
  };
  function PadIcon(p) { return svg(p.size || 16, PI[p.name], p.stroke); }

  // A short, honest time: "now", "4m", "2h", "Yesterday", "Thu", "12 Oct".
  function ago(t) { return t || ''; }

  // SaveState: quiet unless it matters. Typing shows nothing; a save that takes a moment shows a small turning ring;
  // a finished save draws a tick that fades away. Only a problem stays, in amber words, until it's sorted.
  function SaveState(p) {
    var s = p.state || 'saved';
    var fs = useState(false), flash = fs[0], setFlash = fs[1], ws = useState(false), slow = ws[0], setSlow = ws[1];
    var prev = useRef(s);
    useEffect(function () {
      var was = prev.current, t; prev.current = s;
      if (s === 'saving') { setFlash(false); setSlow(false); t = setTimeout(function () { setSlow(true); }, 500); }
      else if (s === 'saved' && was === 'saving') { setSlow(false); setFlash(true); t = setTimeout(function () { setFlash(false); }, 1400); }
      else { setSlow(false); setFlash(false); }
      return function () { clearTimeout(t); };
    }, [s]);
    var problem = { offline: 'Not saved yet', conflict: 'Changed elsewhere', error: 'Didn’t save' }[s];
    var tip = { offline: 'Kept on this device. It saves when you’re back online.', conflict: 'This note changed in another window', error: 'Kept on this device. Trying again.' }[s];
    if (problem) return h('span', { className: cx('tp-root tp-tip tp-below tp-pd-save', 'tp-pd-save-' + s), 'data-tip': tip, role: 'status', 'aria-live': 'polite' },
      h('i', { className: 'tp-pd-save-dot', 'aria-hidden': 'true' }), h('span', { key: s, className: 'tp-pd-save-l' }, problem));
    return h('span', { className: 'tp-root tp-pd-save tp-pd-save-quiet', role: 'status', 'aria-live': 'polite' },
      s === 'saving' && slow ? h('i', { key: 'ring', className: 'tp-pd-save-ring', 'aria-label': 'Saving' }) : null,
      flash ? h('svg', { key: 'tick', className: 'tp-pd-save-tick', width: 14, height: 14, viewBox: '0 0 14 14', 'aria-label': 'Saved' }, h('path', { d: 'M3 7.4l2.6 2.6L11 4.4' })) : null);
  }

  // PadRow: one note in a list. Its icon, its title (or its first line), how many tasks it is linked to, when it last changed.
  function PadRow(p) {
    var pad = p.pad || {};
    return h('button', { type: 'button', role: p.role || undefined, id: p.id, 'aria-selected': p.role ? (p.active ? 'true' : 'false') : undefined, 'aria-current': !p.role && p.active ? 'true' : undefined, tabIndex: p.role ? -1 : undefined,
        className: cx('tp-root tp-pd-row', p.active && 'tp-on', p.className), style: p.depth ? { '--pd-depth': p.depth } : undefined, onClick: p.onPick, onMouseMove: p.onHover },
      h('span', { className: 'tp-pd-row-ic' }, h(PadIcon, { name: 'pad', size: 14 })),
      h('span', { className: 'tp-pd-row-m' },
        h('span', { className: cx('tp-pd-row-t', !pad.title && 'tp-pd-untitled') }, pad.title || pad.first || 'Untitled'),
        p.sub !== false && (pad.where || p.sub) ? h('span', { className: 'tp-pd-row-s' }, p.sub || pad.where) : null),
      p.links !== false && pad.links ? h('span', { className: 'tp-pd-row-ln', 'aria-label': 'Linked to ' + pad.links + (pad.links === 1 ? ' task' : ' tasks') }, h(TP.Icon, { name: 'link', size: 12 }), pad.links) : null,
      p.time !== false && pad.edited ? h('span', { className: 'tp-pd-row-time' }, ago(pad.edited)) : null);
  }

  // FolderRow + its children, which open and close by easing their own height (no jump below).
  // Every row drags: a note onto a folder goes into it, between notes it slots in; a folder goes into another folder or
  // between folders, as long as nothing ends up deeper than three levels.
  function Folder(p) {
    var f = p.folder, depth = p.depth || 0, dnd = p.dnd;
    var open = !!p.openIds[f.id] || !!p.filtering;
    var count = (f.pads || []).length + (f.folders || []).length;
    var over = dnd.over && dnd.over.id === f.id ? dnd.over : null;
    // ⋯ on a folder: Rename (the name turns into a field, in place) and Delete (the folder and what's in it go to Trash).
    var ms = useState(false), menu = ms[0], setMenu = ms[1], rs = useState(false), renaming = rs[0], setRenaming = rs[1];
    var ns = useState(f.name), name = ns[0], setName = ns[1], ls = useState(null), local = ls[0], setLocal = ls[1], shown = p.names && p.names[f.id] || local || f.name, ks = useState(false), asking = ks[0], setAsking = ks[1];
    var fw = useRef(null), field = useRef(null);
    useEffect(function () {
      if (!menu) return;
      function down(e) { if (fw.current && !fw.current.contains(e.target)) setMenu(false); }
      function esc(e) { if (e.key === 'Escape') setMenu(false); }
      document.addEventListener('pointerdown', down); document.addEventListener('keydown', esc);
      return function () { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc); };
    }, [menu]);
    // Open the menu upward when the tree has no room for it below.
    React.useLayoutEffect(function () {
      var pop = menu && fw.current ? fw.current.querySelector('.tp-pd-pop') : null; if (!pop) return;
      for (var n = fw.current.parentElement; n && n !== document.body; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (cs.overflowY !== 'visible') { var c = n.getBoundingClientRect(), a = fw.current.getBoundingClientRect(), m = pop.getBoundingClientRect(); if (a.bottom + m.height + 8 > c.bottom && a.top - c.top > c.bottom - a.bottom) pop.classList.add('tp-pd-pop-up'); break; }
      }
    }, [menu]);
    useEffect(function () { if (renaming && field.current) { field.current.focus(); field.current.select(); } }, [renaming]);
    function finish(keep) {
      var v = name.trim(); setRenaming(false);
      if (!keep || !v || v === shown) { setName(shown); return; }
      if (p.onRenameFolder) p.onRenameFolder(f, v); else setLocal(v);
    }
    var fmenu = [
      { label: 'Rename', onSelect: function () { setMenu(false); setName(shown); setRenaming(true); } },
      { label: 'Delete', danger: true, onSelect: function () { setMenu(false); setAsking(true); } }
    ];
    var inside = countNotes(f);
    function removeFolder() { setAsking(false); if (p.onDeleteFolder) p.onDeleteFolder(f); else TP.showToast(inside ? 'Moved “' + shown + '” and its ' + (inside === 1 ? 'note' : inside + ' notes') + ' to Trash.' : 'Deleted “' + shown + '”.', { action: 'Undo' }); }
    return h('div', { className: cx('tp-pd-f', dnd.drag && dnd.drag.id === f.id && 'tp-pd-dragging') },
      h(Confirm, { open: asking, title: 'Delete “' + shown + '”?', confirmLabel: 'Delete', busyLabel: 'Deleting…', doneLabel: 'Deleted', onClose: function () { setAsking(false); }, onConfirm: removeFolder },
        inside ? 'The folder and its ' + (inside === 1 ? 'note go' : inside + ' notes go') + ' to Trash for 30 days, then they’re gone for good. Until then you can put them back from Trash.' : 'It’s empty, so nothing else goes with it.'),
      h('div', { className: cx('tp-pd-frow', open && 'tp-open', (menu || renaming) && 'tp-pd-frow-busy', over && 'tp-pd-drop-' + over.zone, over && over.bad && 'tp-pd-nodrop', dnd.landed === f.id && 'tp-pd-landed'), style: { '--pd-depth': depth },
          draggable: !p.filtering && !renaming, onDragStart: function (e) { dnd.start(e, 'folder', f.id); }, onDragEnd: dnd.end,
          onDragOver: function (e) { dnd.overRow(e, 'folder', f.id); }, onDragLeave: function (e) { dnd.leave(e, f.id); }, onDrop: function (e) { dnd.drop(e); } },
        renaming ? h('div', { className: 'tp-pd-ftog tp-pd-frename' },
          h('span', { className: 'tp-pd-chev' }, h(PadIcon, { name: 'chev', size: 13 })),
          h('span', { className: 'tp-pd-row-ic' }, h(PadIcon, { name: 'folder', size: 14 })),
          h('input', { ref: field, className: 'tp-pd-fname-in', value: name, maxLength: 80, 'aria-label': 'Folder name', onChange: function (e) { setName(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } },
            onBlur: function () { finish(true); } })) :
        h('button', { type: 'button', className: 'tp-pd-ftog', onDoubleClick: function () { setName(shown); setRenaming(true); }, 'aria-expanded': open ? 'true' : 'false', onClick: function () { p.onToggle(f.id); } },
          h('span', { className: 'tp-pd-chev' }, h(PadIcon, { name: 'chev', size: 13 })),
          h('span', { className: 'tp-pd-row-ic' }, h(PadIcon, { name: 'folder', size: 14 })),
          h('span', { className: 'tp-pd-fname' }, shown),
          over && over.bad ? h('span', { className: 'tp-pd-nodrop-l' }, 'Too deep') : h('span', { className: 'tp-pd-fcount' }, count || '')),
        h('span', { className: 'tp-pd-fadd' },
          depth < 2 ? h(TP.IconButton, { label: 'New folder in ' + f.name, tipSide: 'bottom-end', onClick: function () { if (p.onNewFolder) p.onNewFolder(f); } }, h(PadIcon, { name: 'folderPlus', size: 14 })) : null,
          h(TP.IconButton, { label: 'New note in ' + f.name, tipSide: 'bottom-end', onClick: function () { if (p.onNewPad) p.onNewPad(f); } }, h(TP.Icon, { name: 'plus', size: 14 })),
          h('span', { ref: fw, className: 'tp-pd-menuw' },
            h(TP.IconButton, { label: 'More', tipSide: 'bottom-end', className: menu ? 'tp-on' : undefined, onClick: function () { setMenu(!menu); } }, h(TP.Icon, { name: 'more', size: 14 })),
            h(Pop, { open: menu, className: 'tp-pd-pop-r tp-pd-fmenu' }, h(TP.Menu, { items: fmenu }))))),
      h('div', { className: cx('tp-pd-kids', open && 'tp-open') }, h('div', null,
        (f.folders || []).map(function (c) { return h(Folder, Object.assign({}, p, { key: c.id, folder: c, depth: depth + 1 })); }),
        (f.pads || []).map(function (pad) { return h(TreePad, { key: pad.id, pad: pad, depth: depth + 1, p: p }); }),
        !count ? h('p', { className: 'tp-pd-fempty', style: { '--pd-depth': depth + 1 } }, 'Empty folder') : null)));
  }
  // A note in the tree: just its mark and its title. Links and times live in the note itself, not in the list.
  function TreePad(o) {
    var pad = o.pad, p = o.p, dnd = p.dnd;
    var over = dnd.over && dnd.over.id === pad.id ? dnd.over : null;
    return h('div', { className: cx('tp-pd-tp', over && 'tp-pd-drop-' + over.zone, dnd.drag && dnd.drag.id === pad.id && 'tp-pd-dragging', dnd.landed === pad.id && 'tp-pd-landed'),
        draggable: !p.filtering, onDragStart: function (e) { dnd.start(e, 'pad', pad.id); }, onDragEnd: dnd.end,
        onDragOver: function (e) { dnd.overRow(e, 'pad', pad.id); }, onDragLeave: function (e) { dnd.leave(e, pad.id); }, onDrop: function (e) { dnd.drop(e); } },
      h(PadRow, { pad: pad, depth: o.depth, active: p.active === pad.id, sub: false, time: false, links: false, onPick: function () { p.onPick(pad); } }));
  }

  function matches(pad, q) { return !q || ((pad.title || pad.first || '') + ' ' + (pad.text || '')).toLowerCase().indexOf(q) >= 0; }
  function prune(folders, q) {
    return folders.map(function (f) {
      var kids = prune(f.folders || [], q), pads = (f.pads || []).filter(function (x) { return matches(x, q); });
      return kids.length || pads.length || f.name.toLowerCase().indexOf(q) >= 0 ? Object.assign({}, f, { folders: kids, pads: pads }) : null;
    }).filter(Boolean);
  }
  // The tree as data: find a node, how deep a folder sits (0 = top), how many levels a folder holds, move a node.
  function clone(t) { return { folders: (t.folders || []).map(function cf(f) { return Object.assign({}, f, { folders: (f.folders || []).map(cf), pads: (f.pads || []).slice() }); }), pads: (t.pads || []).slice() }; }
  function where(t, kind, id) {
    var hit = null;
    (function walk(holder, depth, parent) {
      (holder.folders || []).forEach(function (f, i) { if (hit) return; if (kind === 'folder' && f.id === id) hit = { list: holder.folders, i: i, node: f, depth: depth, parent: parent }; else walk(f, depth + 1, f); });
      if (!hit && kind === 'pad') (holder.pads || []).forEach(function (x, i) { if (!hit && x.id === id) hit = { list: holder.pads, i: i, node: x, depth: depth, parent: parent }; });
    })(t, 0, null);
    return hit;
  }
  function levels(f) { return 1 + Math.max.apply(null, [0].concat((f.folders || []).map(levels))); }
  function inside(f, id) { return (f.folders || []).some(function (c) { return c.id === id || inside(c, id); }); }
  // Is this drop allowed? A folder may not go into itself, and nothing may end up below the third level.
  function check(t, drag, over) {
    if (!drag || !over || drag.id === over.id) return false;
    if (drag.kind === 'pad') return true;
    var src = where(t, 'folder', drag.id); if (!src) return false;
    if (over.kind === 'root') return levels(src.node) <= 3;
    if (over.kind !== 'folder' || inside(src.node, over.id)) return false;
    var tgt = where(t, 'folder', over.id);
    var at = over.zone === 'into' ? tgt.depth + 1 : tgt.depth;
    return at + levels(src.node) <= 3;
  }
  function move(t, drag, over) {
    var n = clone(t), src = where(n, drag.kind, drag.id), key = drag.kind === 'pad' ? 'pads' : 'folders';
    src.list.splice(src.i, 1);
    if (over.kind === 'root') { n[key].push(src.node); return n; }
    var tgt = where(n, over.kind, over.id);
    if (over.zone === 'into') { tgt.node[key] = (tgt.node[key] || []).concat([src.node]); return n; }
    tgt.list.splice(tgt.i + (over.zone === 'after' ? 1 : 0), 0, src.node);
    return n;
  }

  // PadTree: the left side of the Notebook page. Folders first (three levels at most), then notes that sit in no folder,
  // then Trash. "Find a note" narrows it by title and words as you type, opening the folders that hold a match.
  function PadTree(p) {
    var os = useState(p.defaultOpen || {}), openIds = os[0], setOpen = os[1];
    var qs = useState(p.initialQuery || ''), q = qs[0], setQ = qs[1];
    var ql = q.trim().toLowerCase();
    var nm = useState(false), newOpen = nm[0], setNewOpen = nm[1], newRef = useRef(null);
    var ts = useState(function () { return clone({ folders: p.folders, pads: p.pads }); }), tree = ts[0], setTree = ts[1];
    var ds = useState(null), drag = ds[0], setDrag = ds[1], vs = useState(null), over = vs[0], setOver = vs[1], ls = useState(null), landed = ls[0], setLanded = ls[1];
    var lt = useRef(null);
    useEffect(function () { return function () { clearTimeout(lt.current); }; }, []);
    useEffect(function () {
      if (!newOpen) return;
      function down(e) { if (newRef.current && !newRef.current.contains(e.target)) setNewOpen(false); }
      document.addEventListener('pointerdown', down);
      return function () { document.removeEventListener('pointerdown', down); };
    }, [newOpen]);
    function toggle(id) { setOpen(function (o) { var n = Object.assign({}, o); n[id] = !o[id]; return n; }); }
    var dnd = { drag: drag, over: over, landed: landed,
      start: function (e, kind, id) { e.stopPropagation(); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch (x) {} setDrag({ kind: kind, id: id }); },
      end: function () { setDrag(null); setOver(null); },
      overRow: function (e, kind, id) {
        if (!drag) return; e.stopPropagation();
        var r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height, zone;
        if (kind === 'folder') zone = drag.kind === 'pad' ? 'into' : (y < .28 ? 'before' : y > .72 ? 'after' : 'into');
        else { if (drag.kind === 'folder') { setOver(null); return; } zone = y < .5 ? 'before' : 'after'; }
        var o = { kind: kind, id: id, zone: zone };
        var ok = check(tree, drag, o);
        if (ok) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {} }
        else if (kind === 'folder' && zone === 'into' && drag.id !== id) o.bad = true; else o = null;
        if (!over || !o || over.id !== o.id || over.zone !== o.zone || !!over.bad !== !!(o && o.bad)) setOver(o);
      },
      overRoot: function (e) { if (!drag) return; var o = { kind: 'root', id: 'root', zone: 'root' }; if (check(tree, drag, o)) { e.preventDefault(); if (!over || over.id !== 'root') setOver(o); } },
      leave: function (e, id) { if (over && over.id === id && !e.currentTarget.contains(e.relatedTarget)) setOver(null); },
      drop: function (e) {
        e.preventDefault(); e.stopPropagation();
        if (drag && over && !over.bad && check(tree, drag, over)) {
          setTree(move(tree, drag, over));
          if (over.zone === 'into') setOpen(function (o) { var n = Object.assign({}, o); n[over.id] = true; return n; });
          setLanded(drag.id); clearTimeout(lt.current); lt.current = setTimeout(function () { setLanded(null); }, 700);
        }
        setDrag(null); setOver(null);
      } };
    var folders = ql ? prune(tree.folders, ql) : tree.folders;
    var loose = tree.pads.filter(function (x) { return matches(x, ql); });
    var none = ql && !folders.length && !loose.length;
    var common = { openIds: openIds, filtering: !!ql, onToggle: toggle, active: p.active, onPick: p.onPick, onNewPad: p.onNewPad, onNewFolder: p.onNewFolder, dnd: dnd };
    var body;
    if (p.loading) body = h('div', { className: 'tp-pd-tree-load', 'aria-label': 'Loading your notes' }, [150, 120, 170, 96, 140, 110].map(function (w, i) { return h('div', { key: i, className: 'tp-pd-skrow', style: { paddingLeft: (i === 2 || i === 3 ? 34 : 10) + 'px' } }, h(TP.Skeleton, { width: 14, height: 14 }), h(TP.Skeleton, { width: w, height: 11 })); }));
    else if (p.error) body = h('div', { className: 'tp-pd-tree-msg' }, h('p', null, 'Your notes didn’t load.'), h(TP.Button, { variant: 'secondary', size: 'sm', onClick: p.onRetry }, 'Try again'));
    else if (!tree.folders.length && !tree.pads.length) body = h('div', { className: 'tp-pd-tree-msg' }, h('p', null, 'No notes yet. Folders you make show up here.'));
    else body = h('div', { className: cx('tp-pd-tree-list', drag && 'tp-pd-dragon'), role: 'tree', 'aria-label': 'Notes and folders' },
      folders.map(function (f) { return h(Folder, Object.assign({ key: f.id, folder: f, depth: 0 }, common)); }),
      h('div', { className: cx('tp-pd-root', over && over.id === 'root' && 'tp-pd-drop-root'), onDragOver: dnd.overRoot, onDragLeave: function (e) { dnd.leave(e, 'root'); }, onDrop: dnd.drop },
        loose.length || drag ? h('div', { className: 'tp-pd-loose-h' }, 'Not in a folder') : null,
        loose.map(function (pad) { return h(TreePad, { key: pad.id, pad: pad, depth: 0, p: common }); }),
        drag && !loose.length ? h('p', { className: 'tp-pd-fempty' }, 'Drop here to take it out of its folder') : null),
      none ? h('p', { className: 'tp-pd-none' }, 'No note matches “', h('b', null, q.trim()), '”.') : null);
    if (p.bare) return h('nav', { className: cx('tp-root tp-pd-tree tp-pd-tree-bare', p.className), 'aria-label': 'Notebook' },
      h('div', { className: 'tp-pd-tree-ff' }, h(TP.FilterField, { placeholder: 'Find a note', value: q, onChange: function (v) { setQ(typeof v === 'string' ? v : (v && v.target ? v.target.value : '')); } })),
      h('div', { className: 'tp-pd-tree-scroll' }, body));
    return h('nav', { className: cx('tp-root tp-pd-tree', p.className), 'aria-label': 'Notebook' },
      h('div', { className: 'tp-pd-tree-h' },
        h('h2', null, 'Notebook'),
        // One quiet New button: a note (the usual thing, first) or a folder. Two buttons side by side read as noise.
        h('span', { ref: newRef, className: 'tp-pd-menuw' },
          h(TP.IconButton, { label: 'New note or folder', tipSide: 'bottom-end', className: newOpen ? 'tp-on' : undefined, onClick: function () { setNewOpen(!newOpen); } }, h(TP.Icon, { name: 'plus', size: 17 })),
          h(Pop, { open: newOpen, className: 'tp-pd-pop-r tp-pd-newmenu' }, h(TP.Menu, { items: [
            { label: 'New note', onSelect: function () { setNewOpen(false); if (p.onNewPad) p.onNewPad(null); } },
            { label: 'New folder', onSelect: function () { setNewOpen(false); if (p.onNewFolder) p.onNewFolder(null); } }
          ] })))),
      h('div', { className: 'tp-pd-tree-ff' }, h(TP.FilterField, { placeholder: 'Find a note', value: q, onChange: function (v) { setQ(typeof v === 'string' ? v : (v && v.target ? v.target.value : '')); } })),
      h('div', { className: 'tp-pd-tree-scroll' }, body),
      h('div', { className: 'tp-pd-tree-f' },
        h('button', { type: 'button', className: cx('tp-pd-trash', p.active === 'trash' && 'tp-on'), onClick: p.onTrash },
          h(TP.Icon, { name: 'trash', size: 14 }), h('span', null, 'Trash'), p.trashCount ? h('span', { className: 'tp-pd-fcount' }, p.trashCount) : null)));
  }

  // A linked task, as a chip: its space's tile, its ID and its title. The x unlinks (the task itself is untouched).
  function TaskChip(p) {
    var t = p.task;
    return h('span', { className: cx('tp-root tp-pd-tchip', p.className) },
      h('button', { type: 'button', className: 'tp-pd-tchip-b', title: t.title, onClick: p.onOpen },
        t.space ? h(TP.SpaceTile, { space: t.space, size: 14 }) : null,
        h('span', { className: 'tp-pd-tchip-id' }, t.id), h('span', { className: 'tp-pd-tchip-t' }, t.title)),
      p.onUnlink ? h('button', { type: 'button', className: 'tp-pd-tchip-x', 'aria-label': 'Unlink ' + t.id, onClick: p.onUnlink }, h(TP.Icon, { name: 'x', size: 11 })) : null);
  }

  // useFlip: when items in a row come or go, the others glide to their new places and the row eases to its new height
  // instead of jumping. Children opt in with data-flip.
  function useFlip(ref) {
    var last = useRef(null);
    React.useLayoutEffect(function () {
      var box = ref.current; if (!box) return;
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var now = {}, kids = box.querySelectorAll('[data-flip]'), bh = box.offsetHeight;
      kids.forEach(function (k) { now[k.getAttribute('data-flip')] = { x: k.offsetLeft, y: k.offsetTop }; });
      var was = last.current; last.current = { pos: now, h: bh };
      if (!was || still || !box.animate) return;
      kids.forEach(function (k) {
        var a = was.pos[k.getAttribute('data-flip')], b = now[k.getAttribute('data-flip')];
        if (a && (a.x !== b.x || a.y !== b.y)) k.animate([{ transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.25,.8,.25,1)' });
      });
      if (was.h !== bh) box.animate([{ height: was.h + 'px' }, { height: bh + 'px' }], { duration: 240, easing: 'cubic-bezier(.25,.8,.25,1)' });
    });
  }

  // LinkRow: the note's linked tasks and its Link button. A new link pops in; an unlinked one shrinks away first.
  function LinkRow(p) {
    var box = useRef(null), ls = useState({}), leaving = ls[0], setLeaving = ls[1];
    useFlip(box);
    function unlink(t) {
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) { if (p.onUnlink) p.onUnlink(t); return; }
      var n = Object.assign({}, leaving); n[t.id] = true; setLeaving(n);
      setTimeout(function () { setLeaving(function (cur) { var m = Object.assign({}, cur); delete m[t.id]; return m; }); if (p.onUnlink) p.onUnlink(t); }, 170);
    }
    return h('div', { ref: box, className: 'tp-pd-links' },
      (p.links || []).map(function (t) { return h('span', { key: t.id, 'data-flip': t.id, className: cx('tp-pd-flip', leaving[t.id] && 'tp-pd-leaving') }, h(TaskChip, { task: t, onOpen: function () { TP.showToast('Opens ' + t.id + ' in ' + (t.space ? t.space.name : 'its space') + '.'); }, onUnlink: function () { unlink(t); } })); }),
      h('span', { 'data-flip': '+link', className: 'tp-pd-flip' }, p.children));
  }

  // Picker: a small popover with a search line and a list. Links a task to a note, or a note to a task.
  function Picker(p) {
    var qs = useState(''), q = qs[0], setQ = qs[1], as = useState(0), act = as[0], setAct = as[1];
    var input = useRef(null), root = useRef(null);
    useEffect(function () { if (input.current && !p.noFocus) try { input.current.focus({ preventScroll: true }); } catch (e) {} }, []);
    // Keep the picker inside its window or pane: narrow it to fit, then slide it left until its right edge is in.
    React.useLayoutEffect(function () {
      var el = root.current; if (!el) return;
      var box = el.parentNode && el.parentNode.closest ? el.parentNode.closest('.tp-pd-win, .tp-pd-ed, .tp-drawer, .tp-sheet') : null;
      if (!box) return;
      // Measure against the anchor, not the picker: the picker is mid pop-in (scaled) when this runs.
      var b = box.getBoundingClientRect(), scale = b.width / (box.offsetWidth || 1) || 1, gap = 12 * scale;
      var room = (b.width - 2 * gap) / scale;
      if (el.offsetWidth > room) el.style.width = Math.max(220, room) + 'px';
      var anchor = el.parentNode.parentNode.getBoundingClientRect(), right = anchor.left + el.offsetWidth * scale;
      var over = right - (b.right - gap), under = (b.left + gap) - (anchor.left - over);
      if (over > 0) el.style.marginLeft = -(over - Math.max(0, under)) / scale + 'px';
      // Open upward when the box that clips it (a scrolling panel, the window) has no room below but more above.
      var pop = el.parentNode, clip = null;
      for (var n = pop.parentElement; n && n !== document.body; n = n.parentElement) { var cs = getComputedStyle(n); if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { clip = n.getBoundingClientRect(); break; } }
      if (!clip) clip = { top: 0, bottom: window.innerHeight };
      var hgt = el.offsetHeight * scale, a = anchor.bottom + 6 * scale, below = clip.bottom - a, above = anchor.top - 6 * scale - clip.top;
      if (hgt > below - gap && above > below) {
        pop.classList.add('tp-pd-pop-up');
        var lst = el.querySelector('.tp-pd-pick-list');
        if (lst && hgt > above - gap) lst.style.maxHeight = Math.max(120, lst.offsetHeight - (hgt - above + gap) / scale) + 'px';
      }
    }, []);
    var ql = q.trim().toLowerCase();
    var list = (p.items || []).filter(function (x) { return !ql || (x.title + ' ' + (x.id || '') + ' ' + (x.sub || '')).toLowerCase().indexOf(ql) >= 0; }).slice(0, p.max || 6);
    var cur = Math.min(act, Math.max(0, list.length - 1));
    function key(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.length) setAct((cur + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length); }
      else if (e.key === 'Enter') { e.preventDefault(); if (list[cur] && !list[cur].here && p.onPick) p.onPick(list[cur]); }
      else if (e.key === 'Escape') { e.preventDefault(); if (p.onClose) p.onClose(); }
    }
    return h('div', { ref: root, className: cx('tp-root tp-pd-pick', p.className), role: 'dialog', 'aria-label': p.label },
      h('div', { className: 'tp-pd-pick-line' }, h(TP.Icon, { name: 'search', size: 15 }),
        h('input', { ref: input, value: q, placeholder: p.placeholder, 'aria-label': p.placeholder, onChange: function (e) { setQ(e.target.value); setAct(0); }, onKeyDown: key })),
      h('div', { className: 'tp-pd-pick-list', role: 'listbox', 'aria-label': p.label },
        p.loading ? [0, 1, 2].map(function (i) { return h('div', { key: i, className: 'tp-pd-skrow' }, h(TP.Skeleton, { width: 14, height: 14 }), h(TP.Skeleton, { width: [180, 140, 200][i], height: 11 })); })
          : !list.length ? h('p', { className: 'tp-pd-none' }, q ? ['Nothing matches “', h('b', { key: 'b' }, q.trim()), '”.'] : p.empty)
          : list.map(function (x, i) {
            return h('button', { key: x.key || x.id, type: 'button', role: 'option', 'aria-selected': i === cur ? 'true' : 'false', className: cx('tp-pd-pick-it', i === cur && 'tp-on', (x.linked || x.here) && 'tp-pd-linked'), 'aria-disabled': x.here ? 'true' : undefined, onMouseMove: function () { if (i !== cur) setAct(i); }, onClick: function () { if (!x.here && p.onPick) p.onPick(x); } },
              x.space ? h(TP.SpaceTile, { space: x.space, size: 16 }) : h('span', { className: 'tp-pd-row-ic' }, h(PadIcon, { name: x.icon || 'pad', size: 14 })),
              h('span', { className: 'tp-pd-row-m' }, h('span', { className: 'tp-pd-row-t' }, x.id ? h('span', { className: 'tp-pd-tchip-id' }, x.id + ' ') : null, x.title), x.sub ? h('span', { className: 'tp-pd-row-s' }, x.sub) : null),
              x.linked ? h('span', { className: 'tp-pd-row-time' }, 'Linked') : x.here ? h('span', { className: 'tp-pd-row-time' }, 'Here') : null);
          })),
      p.foot ? h('div', { className: 'tp-pd-pick-f' }, p.foot) : null);
  }

  // Folders as one flat list for Move: name, the path above it, three levels at most.
  function flatFolders(fs, above) {
    var out = [];
    (fs || []).forEach(function (f) {
      var path = above.concat([f.name]);
      out.push({ key: f.id, title: f.name, sub: above.length ? above.join(' / ') : null, icon: 'folder', path: path });
      out = out.concat(flatFolders(f.folders, path));
    });
    return out;
  }
  // Pop: a popover that also leaves with motion (130ms) instead of vanishing. It keeps the side it opened on (Picker
  // may have turned it upward) while it leaves.
  function Pop(p) {
    var ss = useState(!!p.open), shown = ss[0], setShown = ss[1], ls = useState(false), leaving = ls[0], setLeaving = ls[1];
    var el = useRef(null), up = useRef(false);
    useEffect(function () {
      if (p.open) { setShown(true); setLeaving(false); return; }
      if (!shown) return;
      up.current = !!(el.current && el.current.classList.contains('tp-pd-pop-up'));
      setLeaving(true);
      var t = setTimeout(function () { setShown(false); setLeaving(false); }, reduced() ? 0 : 130);
      return function () { clearTimeout(t); };
    }, [p.open]);
    if (!shown) return null;
    return h('div', { ref: el, className: cx('tp-pd-pop', p.className, leaving && 'tp-pd-pop-leaving', leaving && up.current && 'tp-pd-pop-up'), 'aria-hidden': leaving ? 'true' : undefined }, p.children);
  }
  function countNotes(f) { return (f.pads || []).length + (f.folders || []).reduce(function (n, c) { return n + countNotes(c); }, 0); }
  // Confirm: the system's ConfirmDialog, lifted to the app's root so its backdrop covers the whole app, not just the panel
  // it was asked from (a sheet or pane can trap a fixed layer).
  function Confirm(p) {
    var anchor = useRef(null), hs = useState(null), host = hs[0], setHost = hs[1];
    React.useLayoutEffect(function () { var a = anchor.current; if (a) setHost(a.closest('.tp-desk') || document.body); }, []);
    return h(React.Fragment, null, h('span', { ref: anchor, hidden: true }), host ? ReactDOM.createPortal(h(TP.ConfirmDialog, p), host) : null);
  }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // PadEditor: one note. Where it lives, how it's saving, its title, the tasks it's linked to, then the words.
  function PadEditor(p) {
    var pad = p.pad || {};
    var ms = useState(false), menu = ms[0], setMenu = ms[1], ps = useState(false), picking = ps[0], setPicking = ps[1];
    var mv = useState(false), moving = mv[0], setMoving = mv[1], gs = useState(false), going = gs[0], setGoing = gs[1], cs = useState(false), asking = cs[0], setAsking = cs[1];
    var ts = useState(pad.title || ''), title = ts[0], setTitle = ts[1];
    var wrap = useRef(null), bs = useState(null), bubble = bs[0], setBubble = bs[1];
    useEffect(function () { setTitle(pad.title || ''); setMenu(false); setPicking(false); setMoving(false); setGoing(false); setBubble(null); }, [pad.id]);
    // Select some words in the note and a small "Make a task" button rises above them.
    useEffect(function () {
      function check() {
        var el = wrap.current, sel = window.getSelection(); if (!el) return;
        var area = el.querySelector('.tp-rte-area');
        if (!sel || sel.isCollapsed || !sel.rangeCount || !area || !area.contains(sel.anchorNode) || !sel.toString().trim()) { setBubble(null); return; }
        var r = sel.getRangeAt(0).getBoundingClientRect(), b = el.getBoundingClientRect(), scale = b.width / (el.offsetWidth || 1) || 1;
        var x = (r.left + r.width / 2 - b.left) / scale, y = (r.top - b.top) / scale;
        setBubble({ x: Math.max(70, Math.min(el.offsetWidth - 70, x)), y: Math.max(8, y - 8), text: sel.toString().trim().replace(/\s+/g, ' ') });
      }
      document.addEventListener('selectionchange', check);
      return function () { document.removeEventListener('selectionchange', check); };
    }, []);
    function makeTask() {
      var t = bubble ? bubble.text : ''; t = t.length > 60 ? t.slice(0, 59) + '…' : t;
      setBubble(null); try { window.getSelection().removeAllRanges(); } catch (e) {}
      TP.showToast('ME-71 “' + t + '” is on Today, linked to this note.', { action: 'Open' });
    }
    useEffect(function () {
      if (!menu && !picking && !moving) return;
      // Any click that isn't on the open popover or its button closes it, inside the note or out.
      function down(e) { var w = e.target && e.target.closest ? e.target.closest('.tp-pd-menuw') : null; if (!w || !wrap.current || !wrap.current.contains(w)) { setMenu(false); setPicking(false); setMoving(false); } }
      function esc(e) { if (e.key === 'Escape') { setMenu(false); setPicking(false); setMoving(false); } }
      document.addEventListener('keydown', esc);
      document.addEventListener('pointerdown', down);
      return function () { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc); };
    }, [menu, picking, moving]);
    if (p.loading) return h('div', { className: cx('tp-root tp-pd-ed', p.compact && 'tp-compact'), 'aria-label': 'Opening the note' },
      h('div', { className: 'tp-pd-ed-top' }, h(TP.Skeleton, { width: 120, height: 10 })),
      h('div', { className: 'tp-pd-ed-in' }, h(TP.Skeleton, { width: 280, height: 26 }), h('div', { style: { height: 22 } }), [92, 80, 96, 60, 88].map(function (w, i) { return h('div', { key: i, style: { marginBottom: 12 } }, h(TP.Skeleton, { width: w + '%', height: 12 })); })));
    if (p.error) return h('div', { className: cx('tp-root tp-pd-ed tp-pd-ed-err', p.compact && 'tp-compact') },
      h(TP.EmptyState, { tone: 'error', title: 'This note didn’t open.', action: 'Try again', onAction: p.onRetry }, 'Nothing in it is lost. It opens again once Tudu reaches the server.'));
    var crumb = (pad.path || []).join('  /  ');
    var links = pad.linked || [];
    var items = [
      { label: 'Move', onSelect: function () { setMenu(false); setMoving(true); setPicking(false); } },
      { label: 'Delete', danger: true, onSelect: function () { setMenu(false); setAsking(true); } }
    ];
    // Delete asks first. Then the note fades off the page and goes to Trash; the toast is the way back.
    function remove() {
      setAsking(false); setGoing(true);
      setTimeout(function () { if (p.onDelete) p.onDelete(pad); else { setGoing(false); TP.showToast('Moved to Trash. It stays there for 30 days.', { action: 'Undo' }); } }, reduced() ? 0 : 180);
    }
    var noteName = pad.title || pad.first || 'this note';
    // Move: every folder, with where it sits, and "Not in a folder". The folder it's in now says Here.
    var here = (pad.path || []).join(' / ');
    var spots = [{ key: '-', title: 'Not in a folder', icon: 'pad', here: !here, path: [] }].concat(flatFolders(p.folders || [], []).map(function (x) { return Object.assign(x, { here: x.path.join(' / ') === here }); }));
    return h('div', { ref: wrap, className: cx('tp-root tp-pd-ed', p.compact && 'tp-compact', going && 'tp-pd-ed-going') },
      h(Confirm, { open: asking, title: 'Delete “' + noteName + '”?', confirmLabel: 'Delete', busyLabel: 'Deleting…', doneLabel: 'Deleted', onClose: function () { setAsking(false); }, onConfirm: remove },
        'It goes to Trash for 30 days, then it’s gone for good. Until then you can put it back from Trash.' + (links.length ? ' Its links to tasks come back with it.' : '')),
      p.banner || null,
      bubble ? h('div', { key: 'bubble', className: 'tp-pd-bubble', style: { left: bubble.x + 'px', top: bubble.y + 'px' } },
        h('button', { type: 'button', onMouseDown: function (e) { e.preventDefault(); }, onClick: makeTask }, h(TP.Icon, { name: 'plus', size: 13 }), 'Make a task')) : null,
      h('div', { className: 'tp-pd-ed-top' },
        h('span', { className: 'tp-pd-crumb' }, crumb ? [h(PadIcon, { key: 'i', name: 'folder', size: 12 }), h('span', { key: 't' }, crumb)] : 'Not in a folder'),
        h(SaveState, { state: p.save }),
        p.onPop ? h(TP.IconButton, { label: p.popLabel || 'Open in its own window', tipSide: 'bottom', onClick: p.onPop }, h(TP.Icon, { name: 'external', size: 16 })) : null,
        h('span', { className: 'tp-pd-menuw' },
          h(TP.IconButton, { label: 'More', tipSide: 'bottom-end', className: menu || moving ? 'tp-on' : undefined, onClick: function () { setMenu(!(menu || moving)); setMoving(false); setPicking(false); } }, h(TP.Icon, { name: 'more', size: 16 })),
          h(Pop, { open: menu, className: 'tp-pd-pop-r' }, h(TP.Menu, { items: items })),
          h(Pop, { open: moving, className: 'tp-pd-pop-r' }, h(Picker, { className: 'tp-pd-movepick', label: 'Move to a folder', placeholder: 'Find a folder', items: spots, max: 12, empty: 'No folders yet.',
            onClose: function () { setMoving(false); },
            onPick: function (x) { setMoving(false); if (p.onMove) p.onMove(pad, x.path); else TP.showToast(x.path.length ? 'Moved to ' + x.title + '.' : 'Moved out of its folder.', { action: 'Undo' }); } })))),
      h('div', { className: 'tp-pd-ed-in' },
        h('input', { className: 'tp-pd-title', value: title, placeholder: pad.first ? pad.first : 'Untitled', 'aria-label': 'Note title', onChange: function (e) { setTitle(e.target.value); if (p.onEdit) p.onEdit(); } }),
        h(LinkRow, { links: links, onUnlink: p.onUnlink },
          h('span', { className: 'tp-pd-menuw' },
            h('button', { type: 'button', className: cx('tp-pd-addlink', picking && 'tp-on'), onClick: function () { setPicking(!picking); setMenu(false); setMoving(false); } }, h(TP.Icon, { name: 'link', size: 13 }), links.length ? 'Link' : 'Link a task'),
            h(Pop, { open: picking }, h(Picker, { label: 'Link a task', placeholder: 'Find a task in any space', items: p.tasks, empty: 'Your tasks from every space show here.', onClose: function () { setPicking(false); }, onPick: function (t) { setPicking(false); if (p.onLink) p.onLink(t); } })))),
        h('div', { className: 'tp-pd-body' }, h(TP.RichTextEditor, { variant: 'notes', label: 'Note', resetKey: pad.id, value: pad.html || '', placeholder: 'Write anything. It saves as you go.', compact: p.compact, autoFocus: p.autoFocus, onInput: function () { if (p.onEdit) p.onEdit(); } }))),
      p.compact ? null : h('div', { className: 'tp-pd-ed-foot' }, (pad.edited ? 'Edited ' + pad.edited : 'New') + (pad.words ? ' · ' + pad.words + ' words' : '') + ' · Only you see this note'));
  }

  // PadWindow: the note that floats over everything (Mac) or over the page (web). A title bar to drag it by, the recent
  // notes down the left, the note on the right. Pin keeps it above other windows (off to start), the arrows fill the screen.
  // It opens on a new blank note, recent notes one click away. A blank note left empty is gone when it closes.
  // Keyboard shortcuts (summoning it, moving through the list) come later: none are shown for now.
  function PadWindow(p) {
    var rs = useState(p.rail !== false), rail = rs[0], setRail = rs[1];
    var as = useState(p.active || 'new'), active = as[0], setActive = as[1];
    useEffect(function () { if (p.active) setActive(p.active); }, [p.active, p.openCount]);
    var cs = useState(0), cur = cs[0], setCur = cs[1];
    var sv = useState(p.save || 'saved'), save = sv[0], setSave = sv[1];
    var tm = useRef(null);
    var recent = p.recent || [], nb = p.notebook;
    var vs = useState('recent'), view = vs[0], setView = vs[1];
    var swapped = useRef(false);
    var openPad = active === 'new' ? { id: 'new', title: '', html: '', path: [], linked: p.newLinked || [] } : recent.filter(function (x) { return x.id === active; })[0] || (nb && nb.pads && nb.pads[active]) || {};
    var opts = [{ id: 'new' }].concat(recent);
    function pick(id) { setActive(id); }
    function key(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setCur((cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(opts[cur].id); }
    }
    function edited() { if (p.save) return; setSave('saving'); clearTimeout(tm.current); tm.current = setTimeout(function () { setSave('saved'); }, 900); }
    useEffect(function () { return function () { clearTimeout(tm.current); }; }, []);
    var web = p.variant === 'web';
    return h('section', { className: cx('tp-root tp-pd-win', p.expanded && 'tp-pd-max', p.pinned && 'tp-pd-pinned', web && 'tp-pd-web', p.className), 'aria-label': 'Notebook' },
      h('header', { className: 'tp-pd-win-bar', onPointerDown: p.onDragStart, onDoubleClick: p.onExpand },
        h(TP.IconButton, { label: rail ? 'Hide the list' : 'Show your notes', tipSide: 'bottom', className: rail ? 'tp-on' : undefined, onClick: function () { setRail(!rail); } }, h(TP.Icon, { name: 'panel', size: 15 })),
        h('span', { className: 'tp-pd-win-title' }, h('span', { key: active }, active === 'new' ? 'New note' : (openPad.title || openPad.first || 'Untitled'))),
        web ? null : h(TP.IconButton, { label: p.pinned ? 'Pinned on top · click to unpin' : 'Keep on top of other windows', tipSide: 'bottom', className: cx('tp-pd-pinbtn', p.pinned && 'tp-on'), onClick: p.onPin }, h(PadIcon, { name: 'pin', size: 15 })),
        web ? null : h(TP.IconButton, { label: p.expanded ? 'Back to its size' : 'Fill the screen', tipSide: 'bottom', onClick: p.onExpand }, h(PadIcon, { name: p.expanded ? 'shrink' : 'expand', size: 15 })),
        h(TP.IconButton, { label: p.openLabel || (web ? 'Open in its own window' : 'Open in your Notebook'), tipSide: 'bottom', className: web ? undefined : 'tp-pd-opentudu', onClick: p.onOpenApp }, web ? h(TP.Icon, { name: 'external', size: 15 }) : h(TP.Logo, { size: 15 })),
        h(TP.IconButton, { label: 'Close', tipSide: 'bottom-end', onClick: p.onClose }, h(TP.Icon, { name: 'x', size: 15 }))),
      h('div', { className: 'tp-pd-win-b' },
        h('aside', { className: cx('tp-pd-rail', !rail && 'tp-off'), 'aria-hidden': rail ? undefined : 'true' }, h('div', { className: 'tp-pd-rail-in' },
          // Recent is where the window opens (quickest); All is the whole notebook, folders and all, without leaving the window.
          nb ? h('div', { className: 'tp-pd-rail-seg' }, h(TP.Segmented, { label: 'Show', value: view, onChange: function (v) { swapped.current = true; setView(v); }, items: [{ value: 'recent', label: 'Recent' }, { value: 'all', label: 'All notes' }] })) : null,
          view === 'all' && nb ? h('div', { key: 'all', className: cx('tp-pd-rail-all', swapped.current && 'tp-pd-rail-from-r') }, h(PadTree, { bare: true, folders: nb.folders, pads: nb.loose, defaultOpen: nb.open, active: active, onPick: function (x) { pick(x.id); } })) :
          h('div', { key: 'recent', className: cx('tp-pd-rail-list', swapped.current && 'tp-pd-rail-from-l'), role: 'listbox', 'aria-label': 'New note or a recent note', tabIndex: 0, 'aria-activedescendant': 'pdw-o' + cur, onKeyDown: key },
            h('button', { type: 'button', role: 'option', id: 'pdw-o0', tabIndex: -1, 'aria-selected': active === 'new' ? 'true' : 'false', className: cx('tp-root tp-pd-row tp-pd-newrow', active === 'new' && 'tp-on', cur === 0 && 'tp-cur'), onMouseMove: function () { setCur(0); }, onClick: function () { pick('new'); } },
              h('span', { className: 'tp-pd-row-ic' }, h(TP.Icon, { name: 'plus', size: 14 })), h('span', { className: 'tp-pd-row-m' }, h('span', { className: 'tp-pd-row-t' }, 'New note'))),
            recent.length ? h('div', { className: 'tp-pd-loose-h' }, 'Recent') : null,
            recent.map(function (pad, i) { return h(PadRow, { key: pad.id, id: 'pdw-o' + (i + 1), role: 'option', pad: pad, active: active === pad.id, className: cur === i + 1 ? 'tp-cur' : undefined, onHover: function () { if (cur !== i + 1) setCur(i + 1); }, onPick: function () { pick(pad.id); } }); }),
            !recent.length ? h('p', { className: 'tp-pd-rail-empty' }, 'Notes you write show up here, newest first.') : null))),
        h('div', { className: 'tp-pd-win-ed' }, h('div', { key: active, className: 'tp-pd-turn' },
          h(PadEditor, { pad: openPad, compact: true, save: p.save || save, autoFocus: active === 'new' && !p.noFocus, tasks: p.tasks, onEdit: edited, banner: p.banner, onPop: null })))),
      web ? null : h('span', { className: 'tp-pd-grip', 'aria-hidden': 'true', onPointerDown: p.onResizeStart }));
  }

  // PadLinks: the notebook section of the task panel. Your notes linked to this task (only you see them, even on a shared task),
  // with New note and Link a note. A note can be linked to as many tasks as you like. Clicking a note opens it in the note
  // window, over the task, so you never lose your place.
  function PadLinks(p) {
    var ps = useState(false), picking = ps[0], setPicking = ps[1];
    var wrap = useRef(null), list = useRef(null), seen = useRef(null), ls = useState({}), leaving = ls[0], setLeaving = ls[1];
    var pads = p.pads || [];
    useFlip(list);
    // Rows there on first show just sit there; a row that arrives later slides in like a new task row.
    var fresh = {};
    if (seen.current) pads.forEach(function (x) { if (!seen.current[x.id]) fresh[x.id] = true; });
    useEffect(function () { var m = {}; pads.forEach(function (x) { m[x.id] = true; }); seen.current = m; });
    function unlink(pad) {
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) { if (p.onUnlink) p.onUnlink(pad); return; }
      setLeaving(function (c) { var n = Object.assign({}, c); n[pad.id] = true; return n; });
      setTimeout(function () { setLeaving(function (c) { var n = Object.assign({}, c); delete n[pad.id]; return n; }); if (p.onUnlink) p.onUnlink(pad); }, 200);
    }
    useEffect(function () {
      if (!picking) return;
      function down(e) { var w = e.target && e.target.closest ? e.target.closest('.tp-pd-menuw') : null; if (!w || !wrap.current || !wrap.current.contains(w)) setPicking(false); }
      document.addEventListener('pointerdown', down);
      return function () { document.removeEventListener('pointerdown', down); };
    }, [picking]);
    return h('section', { ref: wrap, className: 'tp-root tp-td-sec tp-pd-sec' },
      h('h3', { className: 'tp-td-h' }, 'From your notebook', pads.length ? h('span', null, pads.length) : null, h('em', { className: 'tp-pd-private' }, 'Only you see these')),
      p.loading ? h('div', null, [0, 1].map(function (i) { return h('div', { key: i, className: 'tp-pd-skrow' }, h(TP.Skeleton, { width: 14, height: 14 }), h(TP.Skeleton, { width: [200, 150][i], height: 11 })); }))
        : p.error ? h('p', { className: 'tp-pd-quiet tp-pd-err-line' }, h('span', null, 'Your notes for this task didn’t load.'), h('button', { type: 'button', className: 'tp-pd-textbtn', onClick: p.onRetry }, 'Try again'))
        : h('div', { ref: list, className: 'tp-pd-list' }, pads.map(function (pad) {
          return h('div', { key: pad.id, 'data-flip': pad.id, className: cx('tp-pd-li', fresh[pad.id] && 'tp-pd-li-new', leaving[pad.id] && 'tp-pd-li-out') },
            h(PadRow, { pad: pad, onPick: function () { if (p.onOpen) p.onOpen(pad); } }),
            h('span', { className: 'tp-pd-li-acts' },
              h(TP.IconButton, { label: 'Unlink from this task', tipSide: 'bottom-end', onClick: function () { unlink(pad); } }, h(TP.Icon, { name: 'x', size: 14 }))));
        })),
      h('div', { className: 'tp-pd-sec-acts' },
        h('button', { type: 'button', className: 'tp-pd-addlink', onClick: p.onNew }, h(TP.Icon, { name: 'plus', size: 13 }), 'New note'),
        h('span', { className: 'tp-pd-menuw' },
          h('button', { type: 'button', className: cx('tp-pd-addlink', picking && 'tp-on'), onClick: function () { setPicking(!picking); } }, h(TP.Icon, { name: 'link', size: 13 }), 'Link a note'),
          h(Pop, { open: picking }, h(Picker, { label: 'Link a note', placeholder: 'Find a note', items: p.all, empty: 'You have no notes yet. New note makes one linked to this task.', onClose: function () { setPicking(false); }, onPick: function (x) { setPicking(false); if (p.onLink) p.onLink(x); } })))));
  }

  // TaskDetailPads: the system's TaskDetail with the notebook section placed under Notes (until TaskDetail takes `notes` itself).
  function TaskDetailPads(p) {
    var host = useRef(null), ss = useState(null), slot = ss[0], setSlot = ss[1];
    useEffect(function () {
      var root = host.current; if (!root) return;
      var el = document.createElement('div'); el.className = 'tp-pd-slot';
      function place() {
        var secs = root.querySelectorAll('.tp-td-body > .tp-td-sec');
        var notes = null; Array.prototype.forEach.call(secs, function (s) { var hd = s.querySelector('.tp-td-h'); if (hd && /^Notes/.test(hd.textContent)) notes = s; });
        if (notes && el.previousSibling !== notes) notes.after(el);
      }
      place(); setSlot(el);
      var mo = new MutationObserver(place); mo.observe(root, { childList: true, subtree: true });
      return function () { mo.disconnect(); el.remove(); };
    }, []);
    var rest = Object.assign({}, p); delete rest.padLinks;
    return h('div', { ref: host, className: 'tp-pd-tdhost' }, h(TP.TaskDetail, rest), slot ? ReactDOM.createPortal(h(PadLinks, p.padLinks || {}), slot) : null);
  }

  // PadTrash: what you deleted, kept 30 days. Put back returns a note where it was; Delete now and Empty Trash ask first,
  // since they're the only steps that can't be undone. Rows glide out as they go.
  function PadTrash(p) {
    var items = p.items || [], list = useRef(null);
    var ls = useState({}), leaving = ls[0], setLeaving = ls[1], as = useState(null), ask = as[0], setAsk = as[1];
    useFlip(list);
    function leave(x, then) {
      var l = Object.assign({}, leaving); l[x.id] = true; setLeaving(l);
      setTimeout(function () { setLeaving(function (c) { var n = Object.assign({}, c); delete n[x.id]; return n; }); then(); }, reduced() ? 0 : 200);
    }
    var n = items.length, name = function (x) { return x.title || x.first || 'Untitled'; };
    return h('div', { className: 'tp-root tp-pd-trashv' },
      h(Confirm, { open: !!ask, title: ask === 'all' ? 'Empty Trash?' : ask ? 'Delete “' + name(ask) + '” now?' : '', confirmLabel: ask === 'all' ? 'Empty Trash' : 'Delete now', busyLabel: 'Deleting…', doneLabel: 'Deleted',
          onClose: function () { setAsk(null); },
          onConfirm: function () { var a = ask; setAsk(null); if (a === 'all') { if (p.onEmpty) p.onEmpty(); } else leave(a, function () { if (p.onPurge) p.onPurge(a); }); } },
        ask === 'all' ? (n === 1 ? 'The note in Trash goes for good, with its links to tasks.' : 'All ' + n + ' notes in Trash go for good, with their links to tasks.') + ' The tasks themselves stay as they are.'
          : 'It goes for good, with its links to tasks. The tasks themselves stay as they are.'),
      h('div', { className: 'tp-pd-trash-h' },
        h('h2', null, 'Trash'),
        h('span', { className: 'tp-pd-quiet' }, n ? (n === 1 ? '1 note' : n + ' notes') + ' · each one is deleted 30 days after you trash it' : ''),
        n ? h(TP.Button, { variant: 'quiet', size: 'sm', onClick: function () { setAsk('all'); } }, 'Empty Trash') : null),
      n ? h('div', { ref: list, className: 'tp-pd-trash-list' }, items.map(function (x) {
        return h('div', { key: x.id, 'data-flip': x.id, className: cx('tp-pd-trrow', leaving[x.id] && 'tp-pd-li-out') },
          h(PadRow, { pad: Object.assign({}, x, { edited: null }), sub: x.where ? 'From ' + x.where : 'Not in a folder', links: false, time: false }),
          h('span', { className: 'tp-pd-tr-left' }, x.left || '30 days left'),
          h('span', { className: 'tp-pd-tr-acts' },
            h(TP.IconButton, { label: 'Put back', onClick: function () { leave(x, function () { if (p.onRestore) p.onRestore(x); }); } }, h(PadIcon, { name: 'putBack', size: 15 })),
            h(TP.IconButton, { label: 'Delete now', onClick: function () { setAsk(x); } }, h(TP.Icon, { name: 'trash', size: 15 }))));
      }))
        : h('div', { className: 'tp-pd-trash-empty' }, h(TP.EmptyState, { title: 'Nothing in Trash.' }, 'Notes you delete stay here for 30 days, then they’re gone.')));
  }

  // PadHit: a note in Search, under its own Notebook heading. The note mark, the title with the words washed in ink, the line
  // inside that matched, then its folder and when it changed.
  function PadHit(p) {
    var it = p.item || {};
    return h('button', { type: 'button', className: cx('tp-root tp-sh tp-pd-hit', p.active && 'tp-on'), onClick: p.onPick, onMouseMove: p.onHover },
      h('span', { className: 'tp-sh-mark tp-pd-hit-mark', 'aria-hidden': 'true' }, h(PadIcon, { name: 'pad', size: 13 })),
      h('span', { className: 'tp-sh-main' },
        h('span', { className: 'tp-sh-title' }, mark(it.title, p.q)),
        it.snip ? h('span', { className: 'tp-sh-snip' }, mark(it.snip, p.q)) : null,
        h('span', { className: 'tp-sh-by' }, h('span', { className: 'tp-sh-where' }, it.where || 'Not in a folder'), it.links ? h('span', { className: 'tp-sh-id' }, it.links + (it.links === 1 ? ' task' : ' tasks')) : null, h('span', { className: 'tp-sh-id' }, it.edited))));
  }
  function mark(text, q) {
    text = String(text || ''); if (!q) return text;
    var i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return text;
    return [text.slice(0, i), h('mark', { key: 'm', className: 'tp-hl' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  // SearchPanelPads: the system's SearchPanel with a Notes heading under the task matches (until SearchPanel takes `notes`).
  // Notes match on their title and the words inside them; the line that matched shows under the title.
  function SearchPanelPads(p) {
    var host = useRef(null), ss = useState(null), slot = ss[0], setSlot = ss[1], qs = useState((p.initial && p.initial.query) || ''), q = qs[0], setQ = qs[1];
    useEffect(function () {
      var root = host.current; if (!root) return;
      var el = document.createElement('div'); el.className = 'tp-pd-slot';
      function place() { var list = root.querySelector('.tp-sp-list'); if (list && el.parentNode !== list) list.appendChild(el); else if (list && list.lastChild !== el) list.appendChild(el); }
      function read() { var i = root.querySelector('.tp-sp-input'); if (i) setQ(i.value); }
      place(); setSlot(el); read();
      var mo = new MutationObserver(place); mo.observe(root, { childList: true, subtree: true });
      root.addEventListener('input', read);
      return function () { mo.disconnect(); root.removeEventListener('input', read); el.remove(); };
    }, []);
    var ql = q.trim().toLowerCase();
    var hits = !ql ? [] : (p.pads || []).map(function (x) {
      var t = (x.title || x.first || '').toLowerCase(), body = String(x.text || '');
      if (t.indexOf(ql) >= 0) return { it: x, s: 2 };
      var i = body.toLowerCase().indexOf(ql); if (i < 0) return null;
      var a = Math.max(0, i - 28); return { it: Object.assign({}, x, { snip: (a ? '…' : '') + body.slice(a, a + 90) + (a + 90 < body.length ? '…' : '') }), s: 1 };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 4);
    var rest = Object.assign({}, p); delete rest.pads;
    var block = hits.length ? h('div', null, h('div', { className: 'tp-sp-head tp-sp-head-sim' }, 'Notes'),
      hits.map(function (x) { return h('div', { key: x.it.id, className: 'tp-sp-opt' }, h(PadHit, { item: x.it, q: ql, onPick: function () { if (p.onPickPad) p.onPickPad(x.it); } })); })) : null;
    return h('div', { ref: host, className: 'tp-pd-sphost' }, h(TP.SearchPanel, rest), slot && block ? ReactDOM.createPortal(block, slot) : null);
  }

  // Tooltips that open below never get cut off: before one shows, measure where it would land against the nearest
  // box that clips (the window, a pane, a scroller) and pin it to the button's right or left edge if it wouldn't fit.
  if (!window.__tpPdTips) {
    window.__tpPdTips = true;
    var probe = null;
    function clipBox(el) {
      for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.overflow === 'hidden') return n.getBoundingClientRect();
      }
      return { left: 0, right: window.innerWidth };
    }
    function place(e) {
      var el = e.target && e.target.closest ? e.target.closest('.tp-tip.tp-below[data-tip]') : null;
      if (!el) return;
      var a = getComputedStyle(el, '::after');
      if (!probe) { probe = document.createElement('span'); probe.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap'; document.body.appendChild(probe); }
      probe.style.font = a.font; probe.style.letterSpacing = a.letterSpacing; probe.style.padding = a.padding; probe.style.maxWidth = a.maxWidth;
      probe.style.whiteSpace = a.whiteSpace; probe.textContent = el.getAttribute('data-tip');
      var scale = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
      var w = probe.getBoundingClientRect().width * scale, r = el.getBoundingClientRect(), b = clipBox(el), gap = 6 * scale, mid = r.left + r.width / 2;
      el.classList.remove('tp-end', 'tp-pd-tip-start');
      if (mid + w / 2 > b.right - gap) el.classList.add('tp-end');
      else if (mid - w / 2 < b.left + gap) el.classList.add('tp-pd-tip-start');
    }
    document.addEventListener('pointerover', place, true);
    document.addEventListener('focusin', place, true);
  }

  // Row tooltips (a folder's + buttons, a linked note's ×): a tip under or over the button would sit on the next row's
  // title, so these float beside the button instead, outside the list, in a layer of their own that nothing clips.
  if (!window.__tpPdRowTips) {
    window.__tpPdRowTips = true;
    var ROW_TIP = '.tp-pd-fadd .tp-tip[data-tip], .tp-pd-li-acts .tp-tip[data-tip], .tp-pd-tr-acts .tp-tip[data-tip]';
    var tipEl = null, tipFor = null, tipTimer = 0;
    function hideRowTip() { clearTimeout(tipTimer); tipFor = null; if (tipEl) tipEl.classList.remove('tp-on'); }
    function showRowTip(el, now) {
      if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tp-root tp-pd-rowtip'; tipEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(tipEl); }
      tipFor = el; clearTimeout(tipTimer);
      tipTimer = setTimeout(function () {
        if (tipFor !== el || !el.isConnected) return;
        var r = el.getBoundingClientRect(), scale = r.width / (el.offsetWidth || 1) || 1;
        tipEl.textContent = el.getAttribute('data-tip');
        tipEl.style.setProperty('--tip-scale', scale);
        // The board's own theme, since this layer sits outside it.
        var cs = getComputedStyle(el);
        ['--toast', '--toast-foreground', '--shadow-tip', '--font-sans'].forEach(function (k) { tipEl.style.setProperty(k, cs.getPropertyValue(k)); });
        tipEl.classList.remove('tp-left');
        var w = tipEl.offsetWidth * scale, gap = 8 * scale, x = r.right + gap;
        if (x + w > window.innerWidth - 4) { x = r.left - gap - tipEl.offsetWidth; tipEl.classList.add('tp-left'); }
        tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = (r.top + r.height / 2) + 'px';
        tipEl.classList.add('tp-on');
      }, now ? 0 : 450);
    }
    document.addEventListener('pointerover', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(ROW_TIP) : null;
      if (el) { if (el !== tipFor) showRowTip(el, !!(tipEl && tipEl.classList.contains('tp-on'))); } else if (tipFor) hideRowTip();
    }, true);
    document.addEventListener('focusin', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(ROW_TIP) : null;
      if (el && e.target.matches(':focus-visible')) showRowTip(el, true); else if (tipFor) hideRowTip();
    }, true);
    document.addEventListener('pointerdown', hideRowTip, true);
    document.addEventListener('scroll', hideRowTip, true);
    window.addEventListener('blur', hideRowTip);
  }

  window.TuduPaper = Object.assign(window.TuduPaper || {}, { SearchPanelPads: SearchPanelPads, PadIcon: PadIcon, SaveState: SaveState, PadRow: PadRow, PadTree: PadTree, PadEditor: PadEditor, PadWindow: PadWindow, PadLinks: PadLinks, PadPicker: Picker, PadTaskChip: TaskChip, TaskDetailPads: TaskDetailPads, PadHit: PadHit, PadTrash: PadTrash });
})();
