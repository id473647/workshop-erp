/* FILE: product-entry-modal.js
 * ── SHARED PRODUCT ENTRY PANEL ──────────────────────────────────────────────
 * Phase 17 / F1 (16 Sep 2026) — FULL REWRITE.
 *
 * WHY THIS FILE CHANGED: the original (11F Stage 2) version of this file was a
 * floating POPUP — click "+ ADD PRODUCT" / "+ ADD LOT", a modal opens on top of
 * the page, you fill it in, Save closes it. That design was shown to the user
 * and NOT approved. The design that WAS approved (see
 * claude/11B_52_Product_Variant_Architecture_Design.md and the delivered
 * mockup_catalog_unified.html) has NO popup at all: clicking a product row in
 * the Full Catalog expands that row IN PLACE, right there in the table, to
 * show its editable details and its brand/variant list; "+ ADD PRODUCT"
 * inserts a new blank row that expands the same way. This file is the rewrite
 * to match that approved interface. The Supabase read/write logic underneath
 * (parent → variant → always-a-new-lot) is unchanged from the original file —
 * only how it's presented on screen has changed.
 *
 * HOST PAGE CONTRACT — this file no longer owns a single fixed overlay. It
 * mounts into whatever container element the host page hands it, so more than
 * one product can be expanded (or none) at a time, each independent of the
 * others.
 *
 *   ProductEntryModal.init({ client, sessionRole, onSaved })
 *     Call once on page load. Same as before.
 *
 *   ProductEntryModal.expandExisting(containerEl, parent)
 *     Call when the user clicks an existing catalog row to expand it.
 *     `containerEl` is an empty element (e.g. a <td colspan="..."> inside an
 *     inserted <tr>, or a <div>) that this file will fill with the editable
 *     product-details panel + brand/lot table. `parent` is the product_master
 *     row ({id, item_name, category, scope, family_name, unit_metric,
 *     hsn_code, warehouse_type, is_fiber}).
 *
 *   ProductEntryModal.expandNew(containerEl)
 *     Call when the user clicks "+ ADD PRODUCT". Renders the same panel,
 *     blank, for a brand-new product — with one blank brand/lot entry row
 *     underneath so a product can never be saved with zero sellable stock.
 *
 *   ProductEntryModal.collapse(containerEl)
 *     Empties containerEl and forgets its state. Call this when the user
 *     collapses the row (clicks it again / hits a close control).
 *
 * WAREHOUSE FIELD: shown as an editable dropdown only for Admin. For Green /
 * Moped logins it is auto-filled to their own warehouse and hidden — per the
 * approved mockup, a non-Admin login should never see or need to pick a
 * warehouse.
 *
 * NOTE FOR WHOEVER WIRES THIS IN NEXT (Phase 17 / F1 "other half", queued
 * after the costing-engine fix): product-master-console.html's "+ ADD
 * PRODUCT" and "+ ADD LOT" buttons still call the OLD `ProductEntryModal.open()`
 * popup API, which no longer exists in this file. Those call sites need to be
 * repointed to `expandExisting` / `expandNew` against an inserted table row —
 * that repointing is intentionally NOT done in this delivery, since the user
 * asked for the costing engine first and this file second, as two separate
 * pieces of work. Until that repointing happens, product-master-console.html's
 * add/edit buttons will not do anything when clicked.
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';
 
  let _client = null;
  let _sessionRole = '';
  let _onSaved = function () {};
 
  const VOLUME_OPTIONS = ['500', '650', '800', '900', '1000', '1200', '2500'];
  const WAREHOUSES = [
    { v: 'green', l: 'Green' },
    { v: 'moped', l: 'Moped' },
    { v: 'service', l: 'Service' },
    { v: 'universal', l: 'Universal (all counters)' }
  ];
 
  // One entry per currently-expanded row, keyed by a generated instance id.
  // { containerEl, isNew, parentId, parent, variants: [...], draftBrandRows: [rowId,...] }
  const _instances = {};
  let _seq = 0;
 
  function esc(s) { return String(s == null ? '' : s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }
  function up(s) { return String(s == null ? '' : s).toUpperCase(); }
  function money(n) { return '₹' + (parseFloat(n) || 0).toFixed(2); }
 
  function init(config) {
    _client = config.client;
    _sessionRole = (config.sessionRole || '').toLowerCase();
    _onSaved = config.onSaved || function () {};
  }
 
  function _isAdmin() { return _sessionRole === 'admin'; }
  function _autoWarehouse() {
    // Non-Admin logins never pick a warehouse — it's whatever counter they're logged into.
    if (_sessionRole === 'green' || _sessionRole === 'moped') return _sessionRole;
    return 'service'; // Service login has no purchase/catalog-write access today, but fall back sanely if ever called
  }
 
  // ============================================================
  // EXPAND — existing product
  // ============================================================
  async function expandExisting(containerEl, parent) {
    const id = 'pem' + (++_seq);
    _instances[id] = { containerEl, isNew: false, parentId: parent.id, parent, variants: [], draftBrandRows: [] };
    containerEl.dataset.pemInstance = id;
    containerEl.innerHTML = _skeleton(id, parent, false);
    await _reloadBrands(id);
  }
 
  // ============================================================
  // EXPAND — brand-new product
  // ============================================================
  function expandNew(containerEl) {
    const id = 'pem' + (++_seq);
    _instances[id] = { containerEl, isNew: true, parentId: null, parent: null, variants: [], draftBrandRows: [] };
    containerEl.dataset.pemInstance = id;
    containerEl.innerHTML = _skeleton(id, null, true);
    _addBrandRow(id); // a brand-new product always starts with one blank brand/lot row to fill in
  }
 
  function collapse(containerEl) {
    const id = containerEl.dataset.pemInstance;
    if (id) delete _instances[id];
    containerEl.innerHTML = '';
    delete containerEl.dataset.pemInstance;
  }
 
  // ============================================================
  // PRODUCT-DETAILS PANEL (parent fields)
  // ============================================================
  function _skeleton(id, parent, isNew) {
    const p = parent || {};
    const showWarehouseDropdown = _isAdmin();
    const warehouseVal = p.warehouse_type || (isNew ? _autoWarehouse() : 'green');
    return `
    <div class="pem-panel" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:6px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-weight:700;color:#7c3aed;font-size:.9rem;">${isNew ? '➕ NEW PRODUCT' : '✏️ PRODUCT DETAILS'}</div>
        <button onclick="ProductEntryModal.collapse(this.closest('[data-pem-instance]'))" style="border:none;background:none;font-size:1.1rem;cursor:pointer;color:#64748b;" title="Collapse">▲ Collapse</button>
      </div>
 
      <div style="margin-bottom:8px;">
        <label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">PRODUCT NAME * (ALL CAPS)</label>
        <input type="text" id="${id}-name" value="${esc(p.item_name || '')}" oninput="this.value=this.value.toUpperCase()" ${isNew ? '' : 'readonly style="background:#eef2f7;"'} placeholder="e.g. 20W40 SL GRADE" style="width:100%;padding:8px;border:2px solid #7c3aed;border-radius:6px;box-sizing:border-box;font-weight:700;${isNew ? '' : 'background:#eef2f7;'}">
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px;">
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">CATEGORY *</label>
          <select id="${id}-category" onchange="ProductEntryModal._toggleVolCols('${id}')" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;">
            <option value="Spare" ${p.category === 'Spare' || !p.category ? 'selected' : ''}>Spare Part</option>
            <option value="Lubricant" ${p.category === 'Lubricant' ? 'selected' : ''}>Lubricant</option>
          </select></div>
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">SCOPE</label>
          <select id="${id}-scope" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;">
            <option value="generic" ${(!p.scope || p.scope === 'generic') ? 'selected' : ''}>Generic (many vehicles)</option>
            <option value="universal" ${p.scope === 'universal' ? 'selected' : ''}>Universal (all vehicles)</option>
            <option value="specific" ${p.scope === 'specific' ? 'selected' : ''}>Specific (one model only)</option>
          </select></div>
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">FAMILY NAME</label>
          <input type="text" id="${id}-family" value="${esc(p.family_name || '')}" oninput="this.value=this.value.toUpperCase()" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;box-sizing:border-box;"></div>
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">UNIT</label>
          <select id="${id}-unit" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;">
            ${['Pcs','Set','Pair','Ltr','ML','Kg','Mtr'].map(u => `<option value="${u}" ${p.unit_metric === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select></div>
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">HSN CODE</label>
          <input type="text" id="${id}-hsn" value="${esc(p.hsn_code || '')}" placeholder="e.g. 2710" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;box-sizing:border-box;"></div>
        ${showWarehouseDropdown ? `
        <div><label style="font-size:.7rem;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">WAREHOUSE *</label>
          <select id="${id}-warehouse" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:6px;">
            ${WAREHOUSES.map(w => `<option value="${w.v}" ${warehouseVal === w.v ? 'selected' : ''}>${w.l}</option>`).join('')}
          </select></div>` : `
        <input type="hidden" id="${id}-warehouse" value="${esc(warehouseVal)}">
        <div style="font-size:.72rem;color:#94a3b8;align-self:end;padding-bottom:8px;">Warehouse: <b>${esc(warehouseVal)}</b> (set automatically for your login)</div>`}
      </div>
      <label style="font-size:.76rem;display:flex;align-items:center;gap:6px;margin-bottom:10px;color:#64748b;">
        <input type="checkbox" id="${id}-fiber" ${p.is_fiber ? 'checked' : ''}> Fiber / multi-look item (brands can have their own colour + pattern)
      </label>
      <button onclick="ProductEntryModal._saveParent('${id}')" style="padding:8px 16px;border:none;border-radius:6px;background:#2563eb;color:white;font-weight:700;cursor:pointer;font-size:.82rem;">💾 Save Product Details</button>
      <span id="${id}-parentMsg" style="font-size:.78rem;margin-left:10px;"></span>
 
      <div style="border-top:1px solid #e2e8f0;margin-top:14px;padding-top:12px;">
        <div style="font-weight:700;color:#64748b;font-size:.82rem;margin-bottom:8px;">BRANDS / VARIANTS</div>
        <div id="${id}-brandTable"></div>
        <button onclick="ProductEntryModal._addBrandRow('${id}')" style="margin-top:8px;padding:7px 14px;border:1px dashed #7c3aed;border-radius:6px;background:white;color:#7c3aed;font-weight:700;cursor:pointer;font-size:.8rem;">+ ADD BRAND</button>
      </div>
    </div>`;
  }
 
  function _toggleVolCols(id) {
    _renderBrandTable(id); // re-render so volume column shows/hides correctly for Lubricant vs Spare
  }
 
  function _isLube(id) {
    const el = document.getElementById(`${id}-category`);
    return el ? el.value === 'Lubricant' : (_instances[id] && _instances[id].parent && _instances[id].parent.category === 'Lubricant');
  }
 
  // ============================================================
  // SAVE PARENT (product_master row)
  // ============================================================
  async function _saveParent(id) {
    const inst = _instances[id];
    if (!inst) return;
    const msg = document.getElementById(`${id}-parentMsg`);
    const name = document.getElementById(`${id}-name`).value.trim().toUpperCase();
    if (!name) { msg.style.color = '#dc2626'; msg.innerText = 'Product name is required.'; return; }
    const payload = {
      item_name: name,
      category: document.getElementById(`${id}-category`).value,
      scope: document.getElementById(`${id}-scope`).value,
      family_name: document.getElementById(`${id}-family`).value.trim().toUpperCase() || null,
      unit_metric: document.getElementById(`${id}-unit`).value,
      hsn_code: document.getElementById(`${id}-hsn`).value.trim() || null,
      warehouse_type: document.getElementById(`${id}-warehouse`).value,
      is_fiber: document.getElementById(`${id}-fiber`).checked,
      catalog_status: 'live'
    };
    try {
      if (inst.parentId) {
        const { error } = await _client.from('product_master').update(payload).eq('id', inst.parentId);
        if (error) throw error;
      } else {
        // First save of a brand-new product — reuse an existing product with the same name
        // instead of creating a duplicate, same rule the old popup enforced.
        const { data: existing } = await _client.from('product_master').select('id').ilike('item_name', name).limit(1);
        if (existing && existing.length) {
          inst.parentId = existing[0].id;
          await _client.from('product_master').update(payload).eq('id', inst.parentId);
        } else {
          const { data: created, error } = await _client.from('product_master').insert(payload).select('id').single();
          if (error) throw error;
          inst.parentId = created.id;
        }
      }
      inst.parent = Object.assign({ id: inst.parentId }, payload);
      msg.style.color = '#16a34a';
      msg.innerText = '✓ Saved';
      _onSaved({ parentId: inst.parentId });
    } catch (err) {
      msg.style.color = '#dc2626';
      msg.innerText = 'Save failed: ' + (err.message || err);
    }
  }
 
  // ============================================================
  // BRAND / VARIANT / LOT TABLE
  // ============================================================
  async function _reloadBrands(id) {
    const inst = _instances[id];
    if (!inst || !inst.parentId) return;
    const { data: variants } = await _client.from('product_variants')
      .select('id,brand,volume_per_unit,color,pattern,mrp,default_price,cost_price,current_stock')
      .eq('parent_product_id', inst.parentId).order('brand');
    inst.variants = variants || [];
    for (const v of inst.variants) {
      const { data: lots } = await _client.from('product_variant_lots')
        .select('id,mrp,sell_price,mac,current_qty,opening_qty,source,created_at')
        .eq('variant_id', v.id).order('created_at', { ascending: false });
      v._lots = lots || [];
      v._expanded = false;
    }
    _renderBrandTable(id);
  }
 
  function _renderBrandTable(id) {
    const inst = _instances[id];
    const wrap = document.getElementById(`${id}-brandTable`);
    if (!wrap) return;
    const isLube = _isLube(id);
    const rows = (inst.variants || []).map(v => _brandRowHtml(id, v, isLube)).join('');
    const draftRows = (inst.draftBrandRows || []).map(r => _draftBrandRowHtml(id, r, isLube)).join('');
    if (!rows && !draftRows) {
      wrap.innerHTML = '<div style="font-size:.8rem;color:#94a3b8;padding:6px 0;">No brands yet — click + ADD BRAND below.</div>';
      return;
    }
    wrap.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
        <thead><tr style="text-align:left;color:#64748b;">
          <th style="padding:5px;">Brand</th>${isLube ? '<th style="padding:5px;">Vol (ml)</th>' : ''}
          <th style="padding:5px;">MRP</th><th style="padding:5px;">Sell</th><th style="padding:5px;">MAC</th><th style="padding:5px;">Stock</th><th style="padding:5px;"></th>
        </tr></thead>
        <tbody>${rows}${draftRows}</tbody>
      </table>`;
  }
 
  function _brandRowHtml(id, v, isLube) {
    const lotCount = (v._lots || []).length;
    const multiLot = lotCount > 1;
    const top = lotCount ? v._lots[0] : null;
    const locked = top && top.source === 'purchase';
    // Single-lot brands are edited directly on this row (no extra expand needed, per the
    // approved mockup) — same rule as the multi-lot sub-rows: editable unless purchase-sourced.
    const mrpCell = !top ? '—' : (locked ? money(top.mrp) : `<input type="number" value="${top.mrp || ''}" onchange="ProductEntryModal._saveLotField('${id}','${top.id}','mrp',this.value)" style="width:65px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`);
    const sellCell = !top ? '—' : (locked ? money(top.sell_price) : `<input type="number" value="${top.sell_price || ''}" onchange="ProductEntryModal._saveLotField('${id}','${top.id}','sell_price',this.value)" style="width:65px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`);
    const macCell = !top ? '—' : (locked ? money(top.mac) : `<input type="number" value="${top.mac || ''}" onchange="ProductEntryModal._saveLotField('${id}','${top.id}','mac',this.value)" style="width:65px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`);
    const qtyCell = !top ? '—' : (locked ? (top.current_qty ?? top.opening_qty ?? 0) : `<input type="number" value="${top.current_qty ?? top.opening_qty ?? 0}" onchange="ProductEntryModal._saveLotField('${id}','${top.id}','current_qty',this.value)" style="width:55px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`);
    const delBtn = (top && !locked) ? `<button onclick="ProductEntryModal._deleteLot('${id}','${top.id}')" title="Delete this lot" style="padding:4px 7px;border:none;border-radius:5px;background:#fef2f2;color:#dc2626;font-size:.72rem;cursor:pointer;">✕</button>` : '';
    // A brand's Volume (ml) is editable here too — not just at creation — so a product that was
    // originally saved as a Spare Part and later corrected to Lubricant can have its existing
    // brand's volume filled in, instead of being permanently stuck showing "—" with no way to
    // set it (the gap reported 16 Sep 2026: switching Category to Lubricant revealed the Vol
    // column, but the existing WUERTH row had no way to actually enter a value into it).
    const volCell = `<input type="number" value="${v.volume_per_unit || ''}" placeholder="ml" onchange="ProductEntryModal._saveVariantVolume('${id}','${v.id}',this.value)" style="width:55px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`;
    let html = `<tr style="border-top:1px solid #f1f5f9;">
      <td style="padding:5px;font-weight:700;">${multiLot ? `<a href="#" onclick="ProductEntryModal._toggleBrandExpand('${id}','${v.id}');return false;" style="text-decoration:none;">${v._expanded ? '▼' : '▶'} </a>` : ''}${esc(v.brand)}${multiLot ? ` <span style="color:#94a3b8;font-weight:400;">(${lotCount} lots)</span>` : ''}</td>
      ${isLube ? `<td style="padding:5px;">${volCell}</td>` : ''}
      <td style="padding:5px;">${multiLot ? '—' : mrpCell}</td>
      <td style="padding:5px;">${multiLot ? '—' : sellCell}</td>
      <td style="padding:5px;">${multiLot ? '—' : macCell}</td>
      <td style="padding:5px;">${multiLot ? (v.current_stock ?? '—') : qtyCell}</td>
      <td style="padding:5px;white-space:nowrap;"><button onclick="ProductEntryModal._addLot('${id}','${v.id}')" style="padding:4px 8px;border:1px dashed #7c3aed;border-radius:5px;background:white;color:#7c3aed;font-size:.72rem;cursor:pointer;">+ ADD LOT</button> ${multiLot ? '' : delBtn}</td>
    </tr>`;
    if (locked && !multiLot) {
      html += `<tr><td colspan="${isLube ? 7 : 6}" style="padding:2px 5px 6px 20px;font-size:.72rem;color:#b45309;">🔒 This lot came from a purchase invoice — only the brand name can be corrected here. To fix pricing/quantity, correct the purchase voucher instead.</td></tr>`;
    }
    if (multiLot && v._expanded) {
      html += v._lots.map(l => _lotSubRowHtml(id, v, l, isLube)).join('');
    }
    return html;
  }
 
  function _lotSubRowHtml(id, v, l, isLube) {
    const locked = l.source === 'purchase';
    return `<tr style="background:#fafbfc;">
      <td style="padding:4px 5px 4px 26px;color:#94a3b8;font-size:.75rem;">↳ lot ${l.id.slice(0, 8)} ${locked ? '🔒' : ''}</td>
      ${isLube ? '<td></td>' : ''}
      <td style="padding:4px 5px;">${locked ? money(l.mrp) : `<input type="number" value="${l.mrp || ''}" onchange="ProductEntryModal._saveLotField('${id}','${l.id}','mrp',this.value)" style="width:70px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`}</td>
      <td style="padding:4px 5px;">${locked ? money(l.sell_price) : `<input type="number" value="${l.sell_price || ''}" onchange="ProductEntryModal._saveLotField('${id}','${l.id}','sell_price',this.value)" style="width:70px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`}</td>
      <td style="padding:4px 5px;">${locked ? money(l.mac) : `<input type="number" value="${l.mac || ''}" onchange="ProductEntryModal._saveLotField('${id}','${l.id}','mac',this.value)" style="width:70px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`}</td>
      <td style="padding:4px 5px;">${locked ? (l.current_qty ?? l.opening_qty ?? 0) : `<input type="number" value="${l.current_qty ?? l.opening_qty ?? 0}" onchange="ProductEntryModal._saveLotField('${id}','${l.id}','current_qty',this.value)" style="width:60px;padding:3px;border:1px solid #e2e8f0;border-radius:4px;">`}</td>
      <td>${locked ? '' : `<button onclick="ProductEntryModal._deleteLot('${id}','${l.id}')" title="Delete this lot" style="padding:3px 6px;border:none;border-radius:5px;background:#fef2f2;color:#dc2626;font-size:.7rem;cursor:pointer;">✕</button>`}</td>
    </tr>`;
  }
 
  // Deletes one lot permanently (mirrors the DEL affordance the old grouped-catalog table
  // already had). Purchase-sourced lots are never offered a delete button in the HTML above —
  // correcting those means correcting the purchase voucher, not deleting the record of it.
  async function _deleteLot(id, lotId) {
    if (!confirm('Delete this batch/lot permanently? This cannot be undone.')) return;
    const { error } = await _client.from('product_variant_lots').delete().eq('id', lotId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await _reloadBrands(id);
    _onSaved({ parentId: _instances[id].parentId });
  }
 
  function _toggleBrandExpand(id, variantId) {
    const inst = _instances[id];
    const v = (inst.variants || []).find(x => x.id === variantId);
    if (v) v._expanded = !v._expanded;
    _renderBrandTable(id);
  }
 
  // ── Inline edit of an existing (non-purchase-sourced) lot's own fields ──
  async function _saveLotField(id, lotId, field, value) {
    const payload = {};
    payload[field] = parseFloat(value) || 0;
    const { error } = await _client.from('product_variant_lots').update(payload).eq('id', lotId);
    if (error) { alert('Save failed: ' + error.message); return; }
    await _reloadBrands(id);
    _onSaved({ parentId: _instances[id].parentId });
  }
 
  // Edits a brand/variant's own Volume (ml) — a variant-level field, not a per-lot one (every
  // lot of a brand+volume shares the same volume; changing it changes it for all of that
  // brand's existing lots too, which is correct since volume is part of what defines the
  // variant, unlike price/stock which are per-lot). Blank clears it back to null (Spare Part).
  async function _saveVariantVolume(id, variantId, value) {
    const vol = value.trim() === '' ? null : (parseInt(value) || null);
    const { error } = await _client.from('product_variants').update({ volume_per_unit: vol }).eq('id', variantId);
    if (error) { alert('Save failed: ' + error.message); return; }
    await _reloadBrands(id);
    _onSaved({ parentId: _instances[id].parentId });
  }
 
  // ============================================================
  // ADD BRAND (new variant — a genuinely new brand, OR a new volume of an
  // already-used brand: the system treats these identically, as a new
  // product_variants row)
  // ============================================================
  let _draftSeq = 0;
  function _addBrandRow(id) {
    const inst = _instances[id];
    if (!inst) return;
    inst.draftBrandRows.push({ rowId: 'd' + (++_draftSeq), brand: '', volume: '', mrp: '', sell: '', mac: '', stock: 0, gst: 18, color: '', pattern: '' });
    _renderBrandTable(id);
  }
 
  function _draftBrandRowHtml(id, r, isLube) {
    return `<tr style="border-top:1px solid #f1f5f9;background:#fffbeb;">
      <td style="padding:5px;"><input type="text" placeholder="BRAND" oninput="this.value=this.value.toUpperCase();ProductEntryModal._draftField('${id}','${r.rowId}','brand',this.value)" style="width:90px;padding:4px;border:1px solid #fde68a;border-radius:4px;text-transform:uppercase;"></td>
      ${isLube ? `<td style="padding:5px;"><select onchange="ProductEntryModal._draftField('${id}','${r.rowId}','volume',this.value)" style="padding:4px;border:1px solid #fde68a;border-radius:4px;"><option value="">—</option>${VOLUME_OPTIONS.map(v => `<option value="${v}">${v}</option>`).join('')}</select></td>` : ''}
      <td style="padding:5px;"><input type="number" placeholder="MRP" oninput="ProductEntryModal._draftField('${id}','${r.rowId}','mrp',this.value)" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="Sell" oninput="ProductEntryModal._draftField('${id}','${r.rowId}','sell',this.value)" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="MAC" oninput="ProductEntryModal._draftField('${id}','${r.rowId}','mac',this.value)" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="Qty" value="0" oninput="ProductEntryModal._draftField('${id}','${r.rowId}','stock',this.value)" style="width:55px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;white-space:nowrap;">
        <button onclick="ProductEntryModal._saveBrandRow('${id}','${r.rowId}')" style="padding:4px 8px;border:none;border-radius:5px;background:#16a34a;color:white;font-size:.72rem;cursor:pointer;">Save</button>
        <button onclick="ProductEntryModal._removeDraftRow('${id}','${r.rowId}')" style="padding:4px 8px;border:none;border-radius:5px;background:#f1f5f9;color:#64748b;font-size:.72rem;cursor:pointer;">✕</button>
      </td>
    </tr>`;
  }
 
  function _draftField(id, rowId, field, value) {
    const inst = _instances[id];
    const r = inst.draftBrandRows.find(x => x.rowId === rowId);
    if (r) r[field] = value;
  }
 
  function _removeDraftRow(id, rowId) {
    const inst = _instances[id];
    inst.draftBrandRows = inst.draftBrandRows.filter(x => x.rowId !== rowId);
    _renderBrandTable(id);
  }
 
  // Saving a draft brand row: if a parent hasn't been saved yet (brand-new
  // product), save it first using whatever is currently in the product-detail
  // fields. Then find-or-create the variant, then ALWAYS insert a new lot —
  // same "parent → variant → always-new-lot" rule as the original file.
  async function _saveBrandRow(id, rowId) {
    const inst = _instances[id];
    const r = inst.draftBrandRows.find(x => x.rowId === rowId);
    if (!r) return;
    const brand = (r.brand || '').trim().toUpperCase();
    const mrp = parseFloat(r.mrp) || 0;
    const sell = parseFloat(r.sell) || 0;
    if (!brand) return alert('Brand is required.');
    if (!mrp) return alert('MRP is required.');
    if (!sell) return alert('Selling price is required.');
 
    if (!inst.parentId) {
      await _saveParent(id);
      if (!inst.parentId) return; // parent save failed — bail, error already shown
    }
 
    const vol = _isLube(id) ? (parseInt(r.volume) || null) : null;
    const mac = parseFloat(r.mac) || Math.round(mrp);
    const stock = parseFloat(r.stock) || 0;
 
    try {
      let vq = _client.from('product_variants').select('id').eq('parent_product_id', inst.parentId).ilike('brand', brand);
      vq = vol ? vq.eq('volume_per_unit', vol) : vq.is('volume_per_unit', null);
      const { data: existingVariant } = await vq.limit(1);
      let variantId;
      if (existingVariant && existingVariant.length) {
        variantId = existingVariant[0].id;
        // Existing brand+volume selected again from "+ ADD BRAND" — per the approved design this
        // still always creates a NEW LOT (a fresh batch at this new price), it never overwrites.
      } else {
        const { data: newVariant, error } = await _client.from('product_variants').insert({
          parent_product_id: inst.parentId,
          variant_label: brand + (vol ? ` — ${vol}ml` : ''),
          brand, volume_per_unit: vol,
          warehouse_type: document.getElementById(`${id}-warehouse`).value,
          catalog_status: 'live', mrp, default_price: sell, cost_price: mac, current_stock: stock
        }).select('id').single();
        if (error) throw error;
        variantId = newVariant.id;
      }
      const { error: lotErr } = await _client.from('product_variant_lots').insert({
        variant_id: variantId, mrp, sell_price: sell, mac,
        opening_qty: stock, current_qty: stock, source: 'opening_stock', created_by: _sessionRole
      });
      if (lotErr) throw lotErr;
 
      inst.draftBrandRows = inst.draftBrandRows.filter(x => x.rowId !== rowId);
      await _reloadBrands(id);
      _onSaved({ parentId: inst.parentId, variantId });
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
    }
  }
 
  // ============================================================
  // ADD LOT — another batch of an EXACT existing brand+volume. Never
  // overwrites the earlier lot; always inserts a new product_variant_lots row.
  // ============================================================
  function _addLot(id, variantId) {
    const inst = _instances[id];
    const v = (inst.variants || []).find(x => x.id === variantId);
    if (!v) return;
    const rowId = 'd' + (++_draftSeq);
    inst.draftBrandRows.push({ rowId, brand: v.brand, volume: v.volume_per_unit || '', mrp: '', sell: '', mac: '', stock: 0, _lockedVariantId: variantId });
    _renderLotDraft(id, rowId, v);
  }
 
  function _renderLotDraft(id, rowId, v) {
    // A "+ ADD LOT" draft renders inline right under its brand's row, brand/volume locked
    // (it's this exact variant), only pricing + qty are entered.
    const wrap = document.getElementById(`${id}-brandTable`);
    const isLube = _isLube(id);
    const html = `<tr id="${rowId}-tr" style="background:#fffbeb;">
      <td style="padding:5px;padding-left:20px;font-size:.78rem;">↳ new lot — ${esc(v.brand)}</td>
      ${isLube ? `<td style="padding:5px;">${v.volume_per_unit || '—'}</td>` : ''}
      <td style="padding:5px;"><input type="number" placeholder="MRP" id="${rowId}-mrp" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="Sell" id="${rowId}-sell" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="MAC" id="${rowId}-mac" style="width:65px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;"><input type="number" placeholder="Qty" id="${rowId}-stock" value="0" style="width:55px;padding:4px;border:1px solid #fde68a;border-radius:4px;"></td>
      <td style="padding:5px;white-space:nowrap;">
        <button onclick="ProductEntryModal._saveLotDraft('${id}','${rowId}','${v.id}')" style="padding:4px 8px;border:none;border-radius:5px;background:#16a34a;color:white;font-size:.72rem;cursor:pointer;">Save</button>
        <button onclick="ProductEntryModal._removeDraftRow('${id}','${rowId}');this.closest('tr').remove();" style="padding:4px 8px;border:none;border-radius:5px;background:#f1f5f9;color:#64748b;font-size:.72rem;cursor:pointer;">✕</button>
      </td>
    </tr>`;
    wrap.insertAdjacentHTML('beforeend', html);
  }
 
  async function _saveLotDraft(id, rowId, variantId) {
    const mrp = parseFloat(document.getElementById(`${rowId}-mrp`).value) || 0;
    const sell = parseFloat(document.getElementById(`${rowId}-sell`).value) || 0;
    const mac = parseFloat(document.getElementById(`${rowId}-mac`).value) || Math.round(mrp);
    const stock = parseFloat(document.getElementById(`${rowId}-stock`).value) || 0;
    if (!mrp) return alert('MRP is required.');
    if (!sell) return alert('Selling price is required.');
    try {
      const { error } = await _client.from('product_variant_lots').insert({
        variant_id: variantId, mrp, sell_price: sell, mac,
        opening_qty: stock, current_qty: stock, source: 'opening_stock', created_by: _sessionRole
      });
      if (error) throw error;
      const inst = _instances[id];
      inst.draftBrandRows = inst.draftBrandRows.filter(x => x.rowId !== rowId);
      await _reloadBrands(id);
      _onSaved({ parentId: inst.parentId, variantId });
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
    }
  }
 
  global.ProductEntryModal = {
    init, expandExisting, expandNew, collapse,
    _saveParent, _toggleVolCols, _toggleBrandExpand, _saveLotField, _deleteLot, _saveVariantVolume,
    _addBrandRow, _draftField, _removeDraftRow, _saveBrandRow,
    _addLot, _saveLotDraft
  };
})(window);
