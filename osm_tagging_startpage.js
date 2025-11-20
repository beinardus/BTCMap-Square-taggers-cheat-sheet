(function(){
  'use strict';

  // Select all text inside a <pre><code> when clicked
  document.querySelectorAll('pre code').forEach(function(el){
    el.addEventListener('click', function(){
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  });

  // Make the two check_date lines reflect the current local date (YYYY-MM-DD)
  var el = document.getElementById('btcmap-default-tags');
  if (el) {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var date = yyyy + '-' + mm + '-' + dd;
    var txt = el.textContent;
    txt = txt.replace(/^check_date=.*$/m, 'check_date=' + date);
    txt = txt.replace(/^check_date:currency:XBT=.*$/m, 'check_date:currency:XBT=' + date);
    el.textContent = txt;
  }

  // Helper: extract JSON object/array from text
  function extractJSON(s) {
    if (!s) return null;
    var start = s.indexOf('{');
    var startArr = s.indexOf('[');
    if (startArr !== -1 && (startArr < start || start === -1)) start = startArr;
    if (start === -1) return null;
    for (var i = s.length; i > start; i--) {
      try {
        var sub = s.substring(start, i);
        var obj = JSON.parse(sub);
        return obj;
      } catch (e) {
        // continue
      }
    }
    return null;
  }

  // Render suggestions (same UI style as before)
  function renderSuggestions(list) {
    var results = document.getElementById('llm-results');
    if (!results) return;
    results.innerHTML = '';
    if (!list || !list.length) {
      results.innerHTML = '<div style="padding:10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;color:#334155">No suggestions returned.</div>';
      return;
    }
    var defaultTagsEl = document.getElementById('btcmap-default-tags');

    list.forEach(function(s) {
      var wrapper = document.createElement('div');
      wrapper.style = 'padding:10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px';
      var left = document.createElement('div'); left.style = 'flex:1';
      var title = document.createElement('div'); title.style = 'font-weight:700;color:#0f172a'; title.textContent = s.type || (s.name || 'suggestion');
      var descr = document.createElement('div'); descr.style='color:#475569;font-size:0.95rem;margin-top:4px'; descr.textContent = s.reason || '';
      var tagsPre = document.createElement('pre'); tagsPre.style='background:#0f172a;color:#f1f5f9;padding:8px;border-radius:6px;margin-top:8px;font-size:0.9rem;white-space:pre-wrap';
      var tagText = '';
      if (s.tags && typeof s.tags === 'object') {
        Object.keys(s.tags).forEach(function(k){ tagText += k + '=' + s.tags[k] + '\n'; });
        tagText = tagText.trim();
      } else if (typeof s.tags === 'string') tagText = s.tags;
      tagsPre.textContent = tagText;

      left.appendChild(title);
      left.appendChild(descr);
      left.appendChild(tagsPre);

      var actions = document.createElement('div'); actions.style='display:flex;flex-direction:column;gap:8px';
      var copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy tags'; copyBtn.style='padding:8px 10px;border-radius:8px;background:#0b5fff;color:#fff;border:0;cursor:pointer';
      copyBtn.addEventListener('click', function(){ navigator.clipboard && navigator.clipboard.writeText(tagText); });
      var mergeBtn = document.createElement('button'); mergeBtn.textContent = 'Merge with defaults'; mergeBtn.style='padding:8px 10px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;cursor:pointer';
      mergeBtn.addEventListener('click', function(){
        if (!defaultTagsEl) return;
        var defaults = {};
        defaultTagsEl.textContent.split('\n').forEach(function(line){
          var m = line.match(/^([^=]+)=(.*)$/);
          if (m) defaults[m[1].trim()] = m[2].trim();
        });
        if (s.tags && typeof s.tags === 'object') {
          Object.keys(s.tags).forEach(function(k){ defaults[k] = s.tags[k]; });
        }
        var text = Object.keys(defaults).map(function(k){ return k + '=' + defaults[k]; }).join('\n');
        defaultTagsEl.textContent = text;
      });

      actions.appendChild(copyBtn); actions.appendChild(mergeBtn);
      wrapper.appendChild(left); wrapper.appendChild(actions);
      results.appendChild(wrapper);
    });
  }

  // LLM request logic
  (function(){
    var runBtn = document.getElementById('llm-run');
    if (!runBtn) return; // nothing to do if UI not present
    var clearBtn = document.getElementById('llm-clear');
    var keyInput = document.getElementById('llm-api');
    var providerSel = document.getElementById('llm-provider');
    var keywordsInput = document.getElementById('llm-keywords');
    var status = document.getElementById('llm-status');
    var modelInput = document.getElementById('llm-model');

    // Enforce UI/field to reflect single allowed model
    if (modelInput) {
      try { modelInput.value = 'gpt-5-nano'; modelInput.readOnly = true; modelInput.disabled = true; } catch(e) {}
    }

    // Persist helper: try localStorage, fallback to cookies
    function getSaved(name) {
      try {
        var v = localStorage.getItem(name);
        if (v !== null) return v;
      } catch (e) {}
      var m = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(name) + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }
    function setSaved(name, value) {
      try {
        if (value === null || value === undefined || value === '') { localStorage.removeItem(name); }
        else { localStorage.setItem(name, value); }
        return;
      } catch (e) {}
      if (value === null || value === undefined || value === '') {
        document.cookie = encodeURIComponent(name) + '=;path=/;max-age=0';
      } else {
        var max = 60 * 60 * 24 * 365; // 1 year
        document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + ';path=/;max-age=' + max;
      }
    }

    // Restore saved API key and provider (if any)
    if (keyInput) {
      var savedKey = getSaved('llm_api');
      if (savedKey) { try { keyInput.value = savedKey; } catch(e) {} }
      // Save on change
      keyInput.addEventListener('input', function(){
        try { setSaved('llm_api', (keyInput.value || '').trim() || null); } catch(e) {}
      });
    }
    if (providerSel) {
      var savedProvider = getSaved('llm_provider');
      if (savedProvider && providerSel.querySelector('option[value="' + savedProvider + '"]')) {
        try { providerSel.value = savedProvider; } catch(e) {}
      }
      providerSel.addEventListener('change', function(){
        try { setSaved('llm_provider', providerSel.value || null); } catch(e) {}
      });
    }

    function setStatus(s) { if (status) status.textContent = s || ''; }

    runBtn.addEventListener('click', function(){
      var q = (keywordsInput.value || '').trim();
      if (!q) { setStatus('Enter keywords first.'); return; }

      setStatus('Requesting LLM…');
      var provider = providerSel.value;
      var apiVal = (keyInput.value || '').trim();

      // Build a compact prompt asking for JSON
      var userPrompt = 'You are an assistant that suggests OpenStreetMap node types and tags based on keywords. ' +
        'Return a JSON array of up to 5 suggestions. Each suggestion must be an object with: ' +
        '"type" (short string), "tags" (an object mapping tag keys to tag values), and optional "reason". ' +
        'Do not return any extra explanation outside the JSON. Keywords: "' + q + '". Example element: {"type":"cafe","tags":{"amenity":"cafe","cuisine":"coffee_shop"},"reason":"serves coffee and pastries"}';

      // OpenAI path
      if (provider === 'openai') {
        if (!apiVal) { setStatus('Paste your OpenAI Bearer key in the API key field.'); return; }
        // model is restricted to gpt-5-nano
        var model = 'gpt-5-nano';
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiVal
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: 'You are a JSON-only assistant for OSM tagging.' },
              { role: 'user', content: userPrompt }
            ]
          })
        }).then(function(resp){ return resp.json(); })
        .then(function(data){
          try {
            var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            var parsed = extractJSON(content);
            if (!parsed) {
              setStatus('No JSON detected in assistant response.');
              renderSuggestions([]);
              return;
            }
            setStatus('');
            renderSuggestions(Array.isArray(parsed) ? parsed : [parsed]);
          } catch (e) {
            setStatus('Failed to parse LLM response.');
            renderSuggestions([]);
          }
        }).catch(function(err){
          setStatus('Request error: ' + (err && err.message || err));
        });

      } else { // custom endpoint: POST { prompt, keywords } expecting JSON response (array or object)
        if (!apiVal) { setStatus('Enter custom endpoint URL in the API key/URL field.'); return; }
        fetch(apiVal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt, keywords: q })
        }).then(function(resp){ return resp.text(); })
        .then(function(text){
          var parsed = null;
          try { parsed = JSON.parse(text); }
          catch (e) { parsed = extractJSON(text); }
          if (!parsed) {
            setStatus('No JSON detected in endpoint response.');
            renderSuggestions([]);
            return;
          }
          setStatus('');
          renderSuggestions(Array.isArray(parsed) ? parsed : [parsed]);
        }).catch(function(err){
          setStatus('Request error: ' + (err && err.message || err));
        });
      }
    });

    clearBtn && clearBtn.addEventListener('click', function(){
      keywordsInput.value = '';
      var r = document.getElementById('llm-results'); if (r) r.innerHTML = '';
      setStatus('');
    });
  })();

})();
