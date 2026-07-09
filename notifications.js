// notifications.js — My Care ERP Global Notification Bar
// Add <script src="notifications.js"></script> to every admin/service page.
// Self-contained: no page-specific dependencies. Fails silently if DB unavailable.
(function () {
  'use strict';

  const SB_URL = 'https://jycoirrphpvxkrwrjcwf.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y29pcnJwaHB2eGtyd3JqY3dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTQxMTMsImV4cCI6MjA5MzkzMDExM30.mw7rEiJAX9mFRpLMCFifMNVgjXw6JJHA4RlQhR9gL3k';
  const role = (localStorage.getItem('ERP_ACTIVE_ROLE') || 'guest').toLowerCase();

  if (!['admin', 'service'].includes(role)) return;

  // ── Build bar element ──────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'erp-notif-bar';
  const isAdmin = role === 'admin';
  bar.style.cssText = [
    'display:none',
    'padding:9px 20px',
    'font-size:0.82rem',
    'font-weight:700',
    'text-align:center',
    'cursor:pointer',
    'width:100%',
    'box-sizing:border-box',
    'letter-spacing:0.02em',
    isAdmin ? 'background:#b91c1c;color:white;' : 'background:#d97706;color:#1c1917;'
  ].join(';');
  bar.onclick = () => { window.location.href = 'approvals.html'; };

  function insertBar() {
    if (document.body && !document.getElementById('erp-notif-bar')) {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertBar);
  } else {
    insertBar();
  }

  // ── REST helper (no supabase client dependency) ────────────────────────────
  async function restGet(path) {
    try {
      const res = await fetch(SB_URL + '/rest/v1/' + path, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) { return []; }
  }

  // ── Main check ─────────────────────────────────────────────────────────────
  async function checkAndRender() {
    try {
      if (isAdmin) {
        const pending = await restGet(
          'approval_requests?status=eq.pending&select=id,entity_label,request_type&order=requested_at.desc'
        );
        if (pending && pending.length > 0) {
          const shown = pending.slice(0, 3).map(d => {
            const type = (d.request_type || '').replace(/_/g, ' ').toUpperCase();
            const ent  = d.entity_label ? ' (' + d.entity_label + ')' : '';
            return type + ent;
          }).join(' &nbsp;·&nbsp; ');
          const extra = pending.length > 3 ? ' &nbsp;·&nbsp; +' + (pending.length - 3) + ' more' : '';
          bar.innerHTML = '🔴 &nbsp;' + pending.length +
            ' PENDING APPROVAL' + (pending.length > 1 ? 'S' : '') +
            ':&nbsp;&nbsp;' + shown + extra + '&nbsp;&nbsp;&nbsp;[VIEW ALL →]';
          bar.style.display = 'block';
        } else {
          bar.style.display = 'none';
        }

      } else {
        // Service — check today's unreviewed attendance
        const today = new Date().toISOString().split('T')[0];
        const pending = await restGet(
          'mechanic_attendance?date=eq.' + today +
          '&approved_status=is.null&select=id'
        );
        if (pending && pending.length > 0) {
          bar.innerHTML = '🟡 &nbsp;' + pending.length +
            ' ATTENDANCE ENTR' + (pending.length > 1 ? 'IES' : 'Y') +
            ' PENDING YOUR REVIEW TODAY &nbsp;&nbsp;&nbsp;[REVIEW →]';
          bar.style.display = 'block';
        } else {
          bar.style.display = 'none';
        }
      }
    } catch (e) { /* fail silently */ }
  }

  // Run after page is ready, then every 60 seconds
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkAndRender, 600));
  } else {
    setTimeout(checkAndRender, 600);
  }
  setInterval(checkAndRender, 60000);

})();
