'use strict';
(function () {
  var STORAGE_KEY = 'woonwekker-cookie-consent';
  var LANG_KEY = 'woonwekker-language';
  var LANGS = ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it'];
  var COPY = {
    nl: {
      text: 'We gebruiken Google Ads-cookies alleen als je dat toestaat. Zo meten we of advertenties werken.',
      accept: 'Accepteren',
      reject: 'Weigeren',
      privacy: 'Privacy'
    },
    en: {
      text: 'We use Google Ads cookies only if you allow it. That is how we measure whether ads work.',
      accept: 'Accept',
      reject: 'Reject',
      privacy: 'Privacy'
    },
    es: {
      text: 'Usamos cookies de Google Ads solo si lo permites. Así medimos si los anuncios funcionan.',
      accept: 'Aceptar',
      reject: 'Rechazar',
      privacy: 'Privacidad'
    },
    pl: {
      text: 'Pliki cookie Google Ads stosujemy tylko za Twoją zgodą. Tak mierzymy, czy reklamy działają.',
      accept: 'Akceptuj',
      reject: 'Odrzuć',
      privacy: 'Prywatność'
    },
    pt: {
      text: 'Usamos cookies do Google Ads só se permitir. Assim medimos se os anúncios funcionam.',
      accept: 'Aceitar',
      reject: 'Recusar',
      privacy: 'Privacidade'
    },
    ro: {
      text: 'Folosim cookie-uri Google Ads doar dacă permiți. Așa măsurăm dacă anunțurile funcționează.',
      accept: 'Accept',
      reject: 'Refuz',
      privacy: 'Confidențialitate'
    },
    bg: {
      text: 'Използваме бисквитки на Google Ads само ако позволите. Така мерим дали рекламите работят.',
      accept: 'Приемам',
      reject: 'Отказвам',
      privacy: 'Поверителност'
    },
    it: {
      text: 'Usiamo cookie di Google Ads solo se lo consenti. Così misuriamo se gli annunci funzionano.',
      accept: 'Accetta',
      reject: 'Rifiuta',
      privacy: 'Privacy'
    }
  };

  function currentLang() {
    var lang = 'nl';
    try {
      lang = localStorage.getItem(LANG_KEY) || 'nl';
    } catch (e) {}
    if (LANGS.indexOf(lang) === -1) lang = 'nl';
    return lang;
  }

  function readChoice() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === 'accepted' || v === 'rejected') return v;
    } catch (e) {}
    return null;
  }

  function writeChoice(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {}
  }

  function grantAll() {
    return {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    };
  }

  function denyAll() {
    return {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    };
  }

  function updateConsent(granted) {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', granted ? grantAll() : denyAll());
  }

  function removeBanner() {
    var el = document.getElementById('ww-cookie-banner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner() {
    if (document.getElementById('ww-cookie-banner')) return;
    var t = COPY[currentLang()] || COPY.nl;
    var banner = document.createElement('aside');
    banner.id = 'ww-cookie-banner';
    banner.className = 'ww-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', t.privacy);
    banner.innerHTML =
      '<div class="ww-cookie-inner">' +
      '<p class="ww-cookie-text">' +
      t.text +
      ' <a href="/privacy/">' +
      t.privacy +
      '</a>.</p>' +
      '<div class="ww-cookie-actions">' +
      '<button type="button" class="ww-cookie-btn ww-cookie-reject" data-ww-consent="reject">' +
      t.reject +
      '</button>' +
      '<button type="button" class="ww-cookie-btn ww-cookie-accept" data-ww-consent="accept">' +
      t.accept +
      '</button>' +
      '</div></div>';
    banner.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-ww-consent]');
      if (!btn) return;
      var choice = btn.getAttribute('data-ww-consent');
      if (choice === 'accept') {
        writeChoice('accepted');
        updateConsent(true);
      } else if (choice === 'reject') {
        writeChoice('rejected');
        updateConsent(false);
      } else {
        return;
      }
      removeBanner();
    });
    document.body.appendChild(banner);
  }

  function applyStored() {
    var choice = readChoice();
    if (choice === 'accepted') {
      updateConsent(true);
      return true;
    }
    if (choice === 'rejected') {
      updateConsent(false);
      return true;
    }
    return false;
  }

  function boot() {
    if (applyStored()) return;
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.wwCookieConsent = {
    storageKey: STORAGE_KEY,
    readChoice: readChoice,
    applyStored: applyStored,
    showBanner: showBanner
  };
})();
