(async function() {
  var API_BASE = 'https:' + String.fromCharCode(47, 47) + '127.0.0.1:5555';

  try {
    var isChordPage = window.location.href.indexOf('/tab/') !== -1;
    console.log('[UG Import] URL: ' + window.location.href);
    console.log('[UG Import] Detected as: ' + (isChordPage ? 'CHORD PAGE' : 'SEARCH PAGE'));

    if (isChordPage) {
      var pre = document.querySelector('pre');
      console.log('[UG Import] pre found: ' + !!pre);
      if (!pre) {
        alert('UG Import: No pre element found on chord page.');
        return;
      }
      var html = pre.innerHTML;
      console.log('[UG Import] Sending ' + html.length + ' chars to server for parsing via fetch');
      fetch(API_BASE + '/api/import-raw', {
        method: 'POST',
        body: JSON.stringify({ html: html }),
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      }).then(function(res) {
        console.log('[UG Import] Fetch response:', res.status);
        setTimeout(function() { open(location, '_self').close(); }, 1000);
      }).catch(function(err) {
        console.error('[UG Import] Fetch error:', err);
        alert('UG Import fetch failed. Check server.');
      });
    } else {
      var allLinks = document.querySelectorAll('a[href*="/tab/"]');
      console.log('[UG Import] Found ' + allLinks.length + ' links with /tab/ in href');
      var chordUrl = null;
      for (var i = 0; i < allLinks.length; i++) {
        if (allLinks[i].href.indexOf('-chords-') !== -1) {
          chordUrl = allLinks[i].href;
          console.log('[UG Import] PRIMARY match: ' + chordUrl);
          break;
        }
      }
      if (!chordUrl) {
        console.log('[UG Import] No -chords- URL found, trying ancestor fallback...');
        for (var j = 0; j < allLinks.length; j++) {
          var el = allLinks[j];
          var ancestor = el;
          for (var k = 0; k < 8 && ancestor; k++) ancestor = ancestor.parentElement;
          if (ancestor && /\bChords\b/.test(ancestor.textContent)) {
            chordUrl = el.href;
            console.log('[UG Import] FALLBACK match: ' + chordUrl);
            break;
          }
        }
      }
      if (!chordUrl) {
        console.log('[UG Import] FAILED: No chord URL found');
        alert('UG Import: No "Chords" result found on this page.');
        return;
      }
      console.log('[UG Import] Navigating to: ' + chordUrl);
      sessionStorage.setItem('ug_auto_extract', '1');
      window.location.href = chordUrl;
    }
  } catch(e) {
    console.error('[UG Import] ERROR:', e);
    alert('UG Import error: ' + e.message);
  }
})();
