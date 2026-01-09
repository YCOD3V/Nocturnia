const COPY_FEEDBACK_TIMEOUT = 1600;

const copyIpToClipboard = async (btn) => {
  const ip = '38.225.91.40:2702';

  const restoreLabel = (label) => {
    window.setTimeout(() => {
      btn.textContent = label;
    }, COPY_FEEDBACK_TIMEOUT);
  };

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ip.trim());
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = ip.trim();
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    btn.textContent = 'IP copiada';
    restoreLabel('Copiar IP');
  } catch (error) {
    console.error('No se pudo copiar la IP', error);
    btn.textContent = 'No se pudo copiar';
    restoreLabel('Copiar IP');
  }
};

document.querySelectorAll('[data-copy-ip]').forEach((btn) => {
  btn.addEventListener('click', () => copyIpToClipboard(btn));
});

const track = document.querySelector('.gallery__track');
const prev = document.querySelector('[data-gallery-prev]');
const next = document.querySelector('[data-gallery-next]');
if (track && prev && next) {
  const slides = Array.from(track.children);

  if (!slides.length) {
    prev.disabled = true;
    next.disabled = true;
  } else {
    let index = 0;

    const setSlide = (value) => {
      index = Math.max(0, Math.min(value, slides.length - 1));
      track.style.transform = `translateX(-${index * 100}%)`;
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    };

    prev.addEventListener('click', () => setSlide(index - 1));
    next.addEventListener('click', () => setSlide(index + 1));

    setSlide(0);
  }
}

const mapOpenButtons = document.querySelectorAll('[data-map-open]');
const mapModal = document.querySelector('[data-map-modal]');
const mapCloseEls = document.querySelectorAll('[data-map-close]');
let lastFocusedElement = null;

const openMapModal = () => {
  if (!mapModal) return;
  lastFocusedElement = document.activeElement;
  mapModal.classList.add('is-open');
  mapModal.setAttribute('aria-hidden', 'false');
  mapModal.removeAttribute('hidden');
  const focusable = mapModal.querySelectorAll(
    'button, [href], [tabindex]:not([tabindex="-1"])'
  );
  focusable.length && focusable[0].focus();
};

const closeMapModal = () => {
  if (!mapModal) return;
  mapModal.classList.remove('is-open');
  mapModal.setAttribute('aria-hidden', 'true');
  mapModal.setAttribute('hidden', '');
  mapOpenButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
};

if (mapOpenButtons.length && mapModal) {
  mapOpenButtons.forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      openMapModal();
      mapOpenButtons.forEach((button) => button.setAttribute('aria-expanded', 'true'));
    });
  });
  mapCloseEls.forEach((el) => el.addEventListener('click', closeMapModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mapModal.classList.contains('is-open')) {
      closeMapModal();
      mapOpenButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
    }

    if (e.key === 'Tab' && mapModal.classList.contains('is-open')) {
      const focusableEls = Array.from(
        mapModal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')
      );

      if (!focusableEls.length) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

const statusCard = document.querySelector('.status-card');

if (statusCard) {
  const selectors = {
    players: statusCard.querySelector('[data-server-players]'),
    updated: statusCard.querySelector('[data-server-updated]'),
    note: statusCard.querySelector('[data-server-note]')
  };

  const BATTLEMETRICS_SERVER_ID = '36230853';
  const endpoint = `https://api.battlemetrics.com/servers/${BATTLEMETRICS_SERVER_ID}`;
  const refreshMinutes = Number(statusCard.dataset.refreshInterval) || 30;
  const refreshInterval = Math.max(refreshMinutes, 1) * 60 * 1000;
  const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  let refreshTimerId = null;
  let controller = null;
  let isActive = true;

  const setText = (el, value) => {
    if (el) el.textContent = value;
  };

  const formatTimestamp = (value) => {
    if (!value) return 'Sin dato';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin dato';
    return dateFormatter.format(date);
  };

  const normalizeNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatPlayers = (current, max) => {
    const safeCurrent = normalizeNumber(current);
    const safeMax = normalizeNumber(max);
    if (safeCurrent === null && safeMax === null) return '—';
    if (safeCurrent !== null && safeMax !== null) return `${safeCurrent}/${safeMax}`;
    if (safeCurrent !== null) return `${safeCurrent}`;
    return `—/${safeMax}`;
  };

  const formatAddress = (ip, port, address) => {
    if (ip && port) return `${ip}:${port}`;
    if (ip) return `${ip}`;
    if (address) return address;
    return 'No disponible';
  };

  const scheduleNextSync = () => {
    if (!isActive) return;
    window.clearTimeout(refreshTimerId);
    refreshTimerId = window.setTimeout(syncStatus, refreshInterval);
  };

  const syncStatus = async () => {
    statusCard.dataset.state = 'loading';
    setText(selectors.note, 'Sincronizando…');

    try {
      controller?.abort();
      controller = new AbortController();
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`BattleMetrics respondió ${response.status}`);
      }

      const payload = await response.json();
      const attrs = payload?.data?.attributes ?? {};

      const players = attrs.players;
      const maxPlayers = attrs.maxPlayers;
      const updatedAt = attrs.updatedAt || attrs.details?.updatedAt || attrs.details?.lastUpdated;

      setText(selectors.players, formatPlayers(players, maxPlayers));

      const formattedTimestamp = formatTimestamp(updatedAt || Date.now());
      setText(selectors.updated, formattedTimestamp);
      setText(selectors.note, `Última sincronización · ${formattedTimestamp}`);

      statusCard.dataset.state = 'ready';
    } catch (error) {
      if (error.name === 'AbortError') {
        statusCard.dataset.state = 'paused';
        return;
      }

      console.error('No se pudo sincronizar el estado del servidor con BattleMetrics', error);
      setText(selectors.players, '—');
      const fallbackTimestamp = formatTimestamp(Date.now());
      setText(selectors.updated, fallbackTimestamp);
      setText(
        selectors.note,
        `No se pudo sincronizar. Reintento automático en ${refreshMinutes} min.`
      );
      statusCard.dataset.state = 'error';
    } finally {
      scheduleNextSync();
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      isActive = false;
      controller?.abort();
      window.clearTimeout(refreshTimerId);
    } else {
      isActive = true;
      syncStatus();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  syncStatus();
}

const PROTECTED_SELECTOR = '[data-protect-content]';
const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, [contenteditable="true"]';

const isEditableContext = (target) => {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const allowsUserActions = (target) => {
  if (!target) return true;
  if (isEditableContext(target)) return true;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
};

const isInsideProtectedZone = (target) => Boolean(target?.closest(PROTECTED_SELECTOR));

const shouldBlockEvent = (target) => isInsideProtectedZone(target) && !allowsUserActions(target);

const preventDefaultIfNeeded = (event) => {
  if (shouldBlockEvent(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }
};

document.addEventListener('contextmenu', (event) => {
  if (shouldBlockEvent(event.target)) {
    event.preventDefault();
  }
});

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key?.toLowerCase();
  if (key === 'c' || key === 'x' || key === 'v') {
    if (shouldBlockEvent(event.target)) {
      event.preventDefault();
    }
  }
});

['copy', 'cut', 'paste'].forEach((type) => {
  document.addEventListener(type, preventDefaultIfNeeded, true);
});

document.addEventListener('dragstart', (event) => {
  if (shouldBlockEvent(event.target)) {
    event.preventDefault();
  }
});
