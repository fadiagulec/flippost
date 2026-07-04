/* Owner admin page logic — external file because CSP is script-src 'self'.
 * Calls /revoke-pro with { code, sid, action }. */
(function () {
    var statusEl = document.getElementById('status');

    function setStatus(msg, ok) {
        statusEl.textContent = msg;
        statusEl.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }

    function run(action) {
        var code = document.getElementById('code').value.trim();
        var sid = document.getElementById('sid').value.trim();
        if (!code || !sid) { setStatus('Enter both the creator code and the sid.', false); return; }
        setStatus('⏳ Working…', null);
        fetch('/.netlify/functions/revoke-pro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, sid: sid, action: action })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
              if (!res.ok) { setStatus('❌ ' + (res.d.error || 'Failed'), false); return; }
              if (action === 'check') {
                  setStatus(res.d.revoked ? '🚫 This sid IS revoked (free-tier limits apply).' : '✅ This sid is active Pro.', true);
              } else {
                  setStatus(res.d.revoked ? '🚫 Revoked. Their Pro access now falls back to free-tier limits.' : '✅ Restored to full Pro.', true);
              }
          })
          .catch(function (e) { setStatus('❌ ' + (e.message || 'Network error'), false); });
    }

    document.getElementById('revokeBtn').addEventListener('click', function () {
        if (confirm('Revoke Pro for this sid? (Do this after processing the refund in Stripe.)')) run('revoke');
    });
    document.getElementById('restoreBtn').addEventListener('click', function () { run('restore'); });
    document.getElementById('checkBtn').addEventListener('click', function () { run('check'); });
})();
