(() => {
  'use strict';

  const SUPPORT_TYPES = Object.freeze(['特色课程', '家庭走访', '物资准备']);
  const LOCAL_ONLY_STATUS = '仅本机可见，未同步到共享星空';
  const MAX_MESSAGE_LENGTH = 60;
  const DEFAULT_STAR_LIMIT = 80;

  function validateSupportMessage(value) {
    const message = String(value ?? '').trim();
    const length = Array.from(message).length;
    return {
      valid: length >= 1 && length <= MAX_MESSAGE_LENGTH,
      message,
      length,
    };
  }

  function writePlainText(element, value) {
    if (element) element.textContent = String(value ?? '');
  }

  function mergeSnapshotEvents(snapshot, events) {
    const inserted = new Map();
    const deletedIds = new Set();
    (Array.isArray(events) ? events : []).forEach((event) => {
      if (event?.type === 'DELETE') {
        const id = String(event.id ?? '');
        if (!id) return;
        deletedIds.add(id);
        inserted.delete(id);
        return;
      }
      if (event?.type !== 'INSERT' || !event.star || typeof event.star !== 'object') return;
      const id = String(event.star.id ?? '');
      const key = id || String(event.star.client_id ?? '');
      if (!key) return;
      if (id) deletedIds.delete(id);
      inserted.set(key, event.star);
    });
    const rows = (Array.isArray(snapshot) ? snapshot : [])
      .filter((star) => !deletedIds.has(String(star?.id ?? '')));
    return { snapshot: rows, inserted: Array.from(inserted.values()) };
  }

  function compareNewest(first, second) {
    return Date.parse(second.created_at) - Date.parse(first.created_at);
  }

  function createStarStore(limit = DEFAULT_STAR_LIMIT) {
    const shared = new Map();
    const local = new Map();
    const maxItems = Math.max(1, Number(limit) || DEFAULT_STAR_LIMIT);

    function normalizeStar(value, localOnly = false) {
      if (!value || typeof value !== 'object') return null;
      const star = {
        id: String(value.id ?? ''),
        client_id: String(value.client_id ?? ''),
        support_type: String(value.support_type ?? ''),
        message: String(value.message ?? ''),
        x: Number(value.x),
        y: Number(value.y),
        created_at: String(value.created_at ?? new Date().toISOString()),
      };
      if (!star.client_id || !SUPPORT_TYPES.includes(star.support_type)) return null;
      if (!validateSupportMessage(star.message).valid) return null;
      if (!Number.isFinite(star.x) || star.x < 0 || star.x > 100) return null;
      if (!Number.isFinite(star.y) || star.y < 0 || star.y > 100) return null;
      if (!Number.isFinite(Date.parse(star.created_at))) return null;
      if (localOnly) star.localOnly = true;
      return star;
    }

    function trimToLimit(collection) {
      const newest = Array.from(collection.values()).sort(compareNewest);
      while (newest.length > maxItems) {
        const oldest = newest.pop();
        collection.delete(oldest.client_id);
      }
    }

    return {
      addShared(value) {
        const star = normalizeStar(value);
        if (!star) return false;
        if (!star.id) star.id = shared.get(star.client_id)?.id || '';
        local.delete(star.client_id);
        shared.set(star.client_id, star);
        trimToLimit(shared);
        return true;
      },
      removeSharedById(id) {
        const key = String(id ?? '');
        const entry = Array.from(shared.entries()).find(([, star]) => star.id && star.id === key);
        if (!entry) return false;
        shared.delete(entry[0]);
        return true;
      },
      replaceShared(values, keep = []) {
        shared.clear();
        [...(Array.isArray(values) ? values : []), ...(Array.isArray(keep) ? keep : [])]
          .forEach((star) => this.addShared(star));
      },
      addLocal(value) {
        const star = normalizeStar(value, true);
        if (!star || shared.has(star.client_id)) return false;
        local.set(star.client_id, star);
        trimToLimit(local);
        return true;
      },
      sharedStars() {
        return Array.from(shared.values()).sort(compareNewest);
      },
      localStars() {
        return Array.from(local.values()).sort(compareNewest);
      },
      sharedCount() {
        return shared.size;
      },
    };
  }

  function recordLocalFallback(store, star) {
    store.addLocal(star);
    return LOCAL_ONLY_STATUS;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createStarStore,
      mergeSnapshotEvents,
      recordLocalFallback,
      validateSupportMessage,
      writePlainText,
    };
  }

  if (typeof window === 'undefined' || !window.document) return;

  const document = window.document;
  const dialog = document.querySelector('#support-stars-dialog');
  if (!dialog) return;

  const openButton = document.querySelector('[data-support-stars-open]');
  const closeButton = dialog.querySelector('[data-support-stars-close]');
  const canvas = dialog.querySelector('#support-stars-canvas');
  const scene = dialog.querySelector('.support-stars-scene');
  const starsCount = dialog.querySelector('#support-stars-count');
  const sharedStatus = dialog.querySelector('#support-stars-status');
  const selectedPanel = dialog.querySelector('#support-stars-selected');
  const starsList = dialog.querySelector('#support-stars-list');
  const form = dialog.querySelector('#support-star-form');
  const messageInput = dialog.querySelector('#support-star-message');
  const messageCount = dialog.querySelector('#support-star-message-count');
  const publicConfirmation = dialog.querySelector('#support-star-public-confirm');
  const formStatus = dialog.querySelector('#support-star-form-status');
  const submitButton = dialog.querySelector('#support-star-submit');
  const typeButtons = dialog.querySelectorAll('[data-support-type]');
  const store = createStarStore(DEFAULT_STAR_LIMIT);
  const storageKey = 'weiguang-support-stars-local-v1';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  let selectedSupportType = SUPPORT_TYPES[0];
  let selectedClientId = '';
  let hoveredClientId = '';
  let previousFocus = null;
  let dbClient = null;
  let realtimeChannel = null;
  let connectionStarted = false;
  let realtimeConnected = false;
  let animationFrame = 0;
  let isSubmitting = false;
  let snapshotRequestId = 0;
  let realtimeSequence = 0;
  const recentRealtimeEvents = [];
  const activeSnapshotStarts = new Map();
  const context = canvas?.getContext('2d');
  const ambientStars = Array.from({ length: 88 }, (_, index) => {
    const seed = (number) => Math.abs(Math.sin((index + 1) * number) * 43758.5453) % 1;
    return { x: seed(12.9898) * 100, y: seed(78.233) * 100, radius: 0.35 + seed(39.346) * 1.05, phase: seed(11.135) * Math.PI * 2 };
  });

  function setSharedStatus(message) {
    writePlainText(sharedStatus, message);
  }

  function setFormStatus(message) {
    writePlainText(formStatus, message);
  }

  function updateMessageCount() {
    const length = Array.from(messageInput?.value ?? '').length;
    writePlainText(messageCount, `${length} / ${MAX_MESSAGE_LENGTH} 字`);
    if (messageCount) messageCount.dataset.overLimit = String(length > MAX_MESSAGE_LENGTH);
  }

  function persistLocalStars() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(store.localStars()));
    } catch (_) {
      // Private browsing modes can disable local storage; the in-memory star still remains visible.
    }
  }

  function loadLocalStars() {
    try {
      const cached = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(cached)) cached.forEach((star) => store.addLocal(star));
    } catch (_) {
      try { window.localStorage.removeItem(storageKey); } catch (_) { /* storage is optional */ }
    }
  }

  function allVisibleStars() {
    return [...store.sharedStars(), ...store.localStars()].sort(compareNewest);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
  }

  function renderSelectedStar(star) {
    if (!selectedPanel) return;
    selectedPanel.replaceChildren();
    const heading = document.createElement('strong');
    writePlainText(heading, star.support_type);
    const message = document.createElement('p');
    writePlainText(message, star.message);
    const note = document.createElement('small');
    writePlainText(note, star.localOnly ? LOCAL_ONLY_STATUS : formatDate(star.created_at));
    selectedPanel.append(heading, message, note);
    selectedClientId = star.client_id;
    renderStarList();
    drawCanvas();
  }

  function renderStarList() {
    if (!starsList) return;
    starsList.replaceChildren();
    allVisibleStars().forEach((star) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.clientId = star.client_id;
      button.setAttribute('aria-pressed', String(star.client_id === selectedClientId));
      button.title = star.message;
      writePlainText(button, `${star.localOnly ? '本机 · ' : ''}${star.support_type} · ${star.message}`);
      button.addEventListener('click', () => renderSelectedStar(star));
      item.append(button);
      starsList.append(item);
    });
  }

  function drawOneStar(star, width, height) {
    const x = (star.x / 100) * width;
    const y = (star.y / 100) * height;
    const selected = star.client_id === selectedClientId || star.client_id === hoveredClientId;
    const radius = selected ? 4.3 : 3.1;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.shadowBlur = selected ? 28 : 18;
    context.shadowColor = '#ffffff';
    context.fillStyle = '#ffffff';
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }

  function drawCanvas(time = 0) {
    if (!context || !canvas || !dialog.open) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    const width = bounds.width;
    const height = bounds.height;
    context.clearRect(0, 0, width, height);
    ambientStars.forEach((star) => {
      const alpha = reducedMotion?.matches ? 0.72 : 0.48 + (Math.sin(time / 1500 + star.phase) + 1) * 0.18;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.beginPath();
      context.arc((star.x / 100) * width, (star.y / 100) * height, star.radius, 0, Math.PI * 2);
      context.fill();
    });
    allVisibleStars().forEach((star) => drawOneStar(star, width, height));
  }

  function drawLoop(time) {
    drawCanvas(time);
    if (dialog.open && !reducedMotion?.matches) animationFrame = window.requestAnimationFrame(drawLoop);
  }

  function startCanvas() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (reducedMotion?.matches) drawCanvas();
    else animationFrame = window.requestAnimationFrame(drawLoop);
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawCanvas();
  }

  function nearestStar(clientX, clientY) {
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = ((clientX - bounds.left) / bounds.width) * 100;
    const y = ((clientY - bounds.top) / bounds.height) * 100;
    let nearest = null;
    let shortest = 3.3;
    allVisibleStars().forEach((star) => {
      const distance = Math.hypot(star.x - x, star.y - y);
      if (distance < shortest) {
        shortest = distance;
        nearest = star;
      }
    });
    return nearest;
  }

  function makeClientId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function createTimedFetch(baseFetch, timeoutMs = 9000) {
    return (input, init = {}) => {
      if (typeof window.AbortController !== 'function') return baseFetch(input, init);
      const controller = new window.AbortController();
      const upstreamSignal = init.signal;
      const abortFromUpstream = () => controller.abort(upstreamSignal.reason);
      if (upstreamSignal?.aborted) abortFromUpstream();
      else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      return baseFetch(input, { ...init, signal: controller.signal }).finally(() => {
        window.clearTimeout(timer);
        upstreamSignal?.removeEventListener('abort', abortFromUpstream);
      });
    };
  }

  function configureClient() {
    const config = window.WEIGUANG_SUPABASE_CONFIG || {};
    const sdk = window.supabase;
    if (!sdk?.createClient || !config.url || !config.publishableKey) return null;
    const baseFetch = window.fetch.bind(window);
    return sdk.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      db: { retry: false },
      global: { fetch: createTimedFetch(baseFetch) },
    });
  }

  function refreshCountAndStars() {
    writePlainText(starsCount, String(store.sharedCount()));
    renderStarList();
    drawCanvas();
  }

  function rememberRealtimeStar(star) {
    realtimeSequence += 1;
    recentRealtimeEvents.push({ sequence: realtimeSequence, type: 'INSERT', star });
    pruneRealtimeEvents();
  }

  function rememberRealtimeDelete(id) {
    const rowId = String(id ?? '');
    if (!rowId) return;
    realtimeSequence += 1;
    recentRealtimeEvents.push({ sequence: realtimeSequence, type: 'DELETE', id: rowId });
    pruneRealtimeEvents();
  }

  function pruneRealtimeEvents() {
    const activeStarts = Array.from(activeSnapshotStarts.values());
    if (activeStarts.length === 0) {
      recentRealtimeEvents.length = 0;
      return;
    }
    const earliestNeededSequence = Math.min(...activeStarts);
    while (recentRealtimeEvents[0]?.sequence <= earliestNeededSequence) recentRealtimeEvents.shift();
  }

  function resetSelectionWhenMissing() {
    if (!selectedClientId || allVisibleStars().some((star) => star.client_id === selectedClientId)) return;
    selectedClientId = '';
    if (!selectedPanel) return;
    const hint = document.createElement('span');
    writePlainText(hint, '选中一颗星，读读留下的话');
    selectedPanel.replaceChildren(hint);
  }

  async function loadSharedSnapshot() {
    if (!dbClient) return;
    const requestId = ++snapshotRequestId;
    const sequenceAtStart = realtimeSequence;
    activeSnapshotStarts.set(requestId, sequenceAtStart);
    try {
      const { data, error } = await dbClient
        .from('support_stars')
        .select('id,client_id,support_type,message,x,y,created_at')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_STAR_LIMIT);
      if (error) throw error;
      if (requestId !== snapshotRequestId) return;
      const eventsDuringSnapshot = recentRealtimeEvents.filter((event) => event.sequence > sequenceAtStart);
      const merged = mergeSnapshotEvents(data || [], eventsDuringSnapshot);
      store.replaceShared(merged.snapshot, merged.inserted);
      resetSelectionWhenMissing();
      refreshCountAndStars();
      setSharedStatus(`已读取 ${store.sharedCount()} 颗共享微光。留言均为访客公开发布。`);
      persistLocalStars();
    } catch (_) {
      if (requestId !== snapshotRequestId) return;
      setSharedStatus(`${LOCAL_ONLY_STATUS}。共享数据暂时无法读取。`);
    } finally {
      activeSnapshotStarts.delete(requestId);
      pruneRealtimeEvents();
    }
  }

  function startSharedConnection() {
    if (connectionStarted) return;
    connectionStarted = true;
    dbClient = configureClient();
    if (!dbClient) {
      setSharedStatus(`${LOCAL_ONLY_STATUS}。共享服务尚未连接。`);
      return;
    }
    setSharedStatus('正在连接共享星空…');
    realtimeChannel = dbClient
      .channel('support-stars-public-wall')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_stars' }, (payload) => {
        const wasLocal = store.localStars().some((star) => star.client_id === payload.new?.client_id);
        if (!store.addShared(payload.new)) return;
        rememberRealtimeStar(payload.new);
        refreshCountAndStars();
        persistLocalStars();
        if (wasLocal) {
          setSharedStatus('该星已确认同步到共享星空。');
          setFormStatus('这颗星已确认同步到共享星空。');
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'support_stars' }, (payload) => {
        const rowId = String(payload.old?.id ?? '');
        if (!rowId) return;
        rememberRealtimeDelete(rowId);
        if (!store.removeSharedById(rowId)) return;
        resetSelectionWhenMissing();
        refreshCountAndStars();
        persistLocalStars();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true;
          loadSharedSnapshot();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeConnected = false;
          setSharedStatus('共享星空的实时连接暂时中断，稍后会自动重试。');
        }
      });
  }

  async function stopSharedConnection() {
    connectionStarted = false;
    realtimeConnected = false;
    if (realtimeChannel && dbClient) {
      const channel = realtimeChannel;
      realtimeChannel = null;
      try { await dbClient.removeChannel(channel); } catch (_) { /* the dialog can close even if cleanup fails */ }
    }
  }

  function animateStarFlight(star) {
    if (reducedMotion?.matches || !submitButton || !canvas || !scene || typeof dialog.animate !== 'function') {
      return Promise.resolve();
    }
    const origin = submitButton.getBoundingClientRect();
    const destination = canvas.getBoundingClientRect();
    const shell = dialog.querySelector('.support-stars-shell');
    const shellBounds = shell.getBoundingClientRect();
    if (origin.width < 1 || destination.width < 1 || shellBounds.width < 1) return Promise.resolve();
    const flight = document.createElement('span');
    flight.className = 'support-star-flight';
    flight.setAttribute('aria-hidden', 'true');
    flight.style.left = `${origin.left + origin.width / 2 - shellBounds.left}px`;
    flight.style.top = `${origin.top + origin.height / 2 - shellBounds.top}px`;
    shell.append(flight);
    const targetX = destination.left + (star.x / 100) * destination.width - shellBounds.left;
    const targetY = destination.top + (star.y / 100) * destination.height - shellBounds.top;
    const dx = targetX - (origin.left + origin.width / 2 - shellBounds.left);
    const dy = targetY - (origin.top + origin.height / 2 - shellBounds.top);
    const animation = flight.animate([
      { transform: 'translate3d(0,0,0) scale(.35)', opacity: 0 },
      { transform: `translate3d(${dx * 0.48}px,${dy * 0.48 - 56}px,0) scale(1.2)`, opacity: 1, offset: 0.58 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(.7)`, opacity: 0.2 },
    ], { duration: 920, easing: 'cubic-bezier(.18,.72,.2,1)' });
    return animation.finished.catch(() => {}).then(() => flight.remove());
  }

  function clearFormAfterPublish() {
    if (messageInput) messageInput.value = '';
    if (publicConfirmation) publicConfirmation.checked = false;
    updateMessageCount();
  }

  async function publishStar(event) {
    event.preventDefault();
    if (isSubmitting) return;
    const validation = validateSupportMessage(messageInput?.value);
    if (!validation.valid) {
      setFormStatus('请写下 1–60 个 Unicode 字符的一句话。');
      messageInput?.focus();
      return;
    }
    if (!publicConfirmation?.checked) {
      setFormStatus('请先确认这句话会公开显示，并且不含个人或儿童可识别信息。');
      publicConfirmation?.focus();
      return;
    }
    if (!SUPPORT_TYPES.includes(selectedSupportType)) selectedSupportType = SUPPORT_TYPES[0];
    const star = {
      client_id: makeClientId(),
      support_type: selectedSupportType,
      message: validation.message,
      x: 8 + Math.random() * 84,
      y: 9 + Math.random() * 78,
      created_at: new Date().toISOString(),
    };
    isSubmitting = true;
    if (submitButton) submitButton.disabled = true;
    setFormStatus('正在为这句话点亮一颗星…');
    const flight = animateStarFlight(star);
    try {
      if (!dbClient) throw new Error('shared star service unavailable');
      const { data, error } = await dbClient
        .from('support_stars')
        .insert({
          client_id: star.client_id,
          support_type: star.support_type,
          message: star.message,
          x: star.x,
          y: star.y,
        })
        .select('id,client_id,support_type,message,x,y,created_at')
        .single();
      if (error || !data) throw error || new Error('empty shared star response');
      await flight;
      store.addShared(data);
      rememberRealtimeStar(data);
      renderSelectedStar(data);
      refreshCountAndStars();
      setSharedStatus(realtimeConnected ? '这颗星已经同步到共享星空。' : '这颗星已经写入共享星空；实时更新连接暂不可用。');
      setFormStatus('这颗星已和所有访客共享。谢谢你留下这句话。');
      clearFormAfterPublish();
    } catch (_) {
      await flight;
      const status = recordLocalFallback(store, star);
      persistLocalStars();
      renderSelectedStar(store.localStars().find((item) => item.client_id === star.client_id) || star);
      refreshCountAndStars();
      setSharedStatus(status);
      setFormStatus(`${status}；其他访客暂时看不到这颗星。`);
      clearFormAfterPublish();
    } finally {
      isSubmitting = false;
      if (submitButton) submitButton.disabled = false;
    }
  }

  function openDialog() {
    previousFocus = document.activeElement;
    if (typeof dialog.showModal !== 'function') {
      setSharedStatus('当前浏览器不支持共享星空弹层，请更新浏览器后重试。');
      return;
    }
    dialog.scrollTop = 0;
    dialog.showModal();
    startSharedConnection();
    window.requestAnimationFrame(() => {
      resizeCanvas();
      startCanvas();
      closeButton?.focus({ preventScroll: true });
    });
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  loadLocalStars();
  refreshCountAndStars();
  updateMessageCount();

  openButton?.addEventListener('click', openDialog);
  closeButton?.addEventListener('click', closeDialog);
  dialog.addEventListener('close', () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stopSharedConnection();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('cancel', () => {
    // Keep the browser's native Escape-to-close behavior; the close event restores focus.
  });
  form?.addEventListener('submit', publishStar);
  messageInput?.addEventListener('input', updateMessageCount);
  typeButtons.forEach((button) => button.addEventListener('click', () => {
    selectedSupportType = button.dataset.supportType;
    typeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  }));
  canvas?.addEventListener('click', (event) => {
    const star = nearestStar(event.clientX, event.clientY);
    if (star) renderSelectedStar(star);
  });
  canvas?.addEventListener('pointermove', (event) => {
    const star = nearestStar(event.clientX, event.clientY);
    const next = star?.client_id || '';
    if (next === hoveredClientId) return;
    hoveredClientId = next;
    canvas.style.cursor = star ? 'pointer' : 'crosshair';
    canvas.title = star ? `${star.support_type}：${star.message}` : '共享星空';
    drawCanvas();
  });
  canvas?.addEventListener('pointerleave', () => {
    hoveredClientId = '';
    canvas.title = '共享星空中的微光；选择下方星星可阅读留言';
    drawCanvas();
  });
  window.addEventListener('resize', resizeCanvas, { passive: true });
  reducedMotion?.addEventListener?.('change', () => {
    if (dialog.open) startCanvas();
  });
})();
