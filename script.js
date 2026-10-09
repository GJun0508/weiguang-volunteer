(() => {
  const toast = document.querySelector('.toast');
  let toastTimer;

  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-active');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-active'), 2600);
  }

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (menuButton && nav) {
    const closeMenu = () => {
      nav.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', '打开导航');
    };
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
      nav.classList.toggle('is-open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  const readingBar = document.querySelector('.reading-progress span');
  const navLinks = Array.from(document.querySelectorAll('#site-nav a[href^="#"]'));
  let scrollQueued = false;
  function updateReadingState() {
    scrollQueued = false;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const progress = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0;
    if (readingBar) readingBar.style.width = `${progress}%`;
    const visibleAnchor = [...navLinks].reverse().find(link => {
      const section = document.querySelector(link.getAttribute('href'));
      return section && section.getBoundingClientRect().top <= window.innerHeight * .34;
    });
    navLinks.forEach(link => {
      if (link === visibleAnchor) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function queueReadingState() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateReadingState);
  }
  window.addEventListener('scroll', queueReadingState, { passive: true });
  window.addEventListener('resize', queueReadingState);
  updateReadingState();

  const gradeChart = document.querySelector('.grade-chart');
  const gradeModeButtons = document.querySelectorAll('[data-student-mode]');
  function setGradeMode(mode) {
    if (!gradeChart) return;
    gradeChart.dataset.mode = mode;
    gradeModeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.studentMode === mode)));
    const max = Math.max(...Array.from(gradeChart.querySelectorAll('.grade-row'), row => Number(row.dataset.total)));
    gradeChart.querySelectorAll('.grade-row').forEach(row => {
      const boy = Number(row.dataset.boys);
      const girl = Number(row.dataset.girls);
      const total = Number(row.dataset.total);
      const totalBar = row.querySelector('.bar-total');
      const boyBar = row.querySelector('.bar-boys');
      const girlBar = row.querySelector('.bar-girls');
      if (totalBar) totalBar.style.width = `${total / max * 100}%`;
      if (boyBar) boyBar.style.width = `${boy / max * 100}%`;
      if (girlBar) {
        girlBar.style.width = `${girl / max * 100}%`;
        girlBar.style.left = `${boy / max * 100}%`;
      }
    });
    if (gradeChart.dataset.animated === 'true') {
      gradeChart.classList.remove('is-visible');
      requestAnimationFrame(() => gradeChart.classList.add('is-visible'));
    }
  }
  gradeModeButtons.forEach(button => button.addEventListener('click', () => setGradeMode(button.dataset.studentMode)));
  setGradeMode('count');

  const progressButtons = document.querySelectorAll('[data-progress-filter]');
  const timelineItems = document.querySelectorAll('.timeline-item');
  const progressEmpty = document.querySelector('[data-progress-empty]');
  progressButtons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.progressFilter;
    let visible = 0;
    progressButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    timelineItems.forEach(item => {
      const show = filter === 'all' || item.dataset.status === filter;
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (progressEmpty) {
      progressEmpty.hidden = visible > 0;
      if (!visible) {
        const labels = { preparing: '筹备中', confirmed: '已确认', underway: '进行中', completed: '已完成' };
        progressEmpty.textContent = `暂无${labels[filter] || ''}记录。最近更新时间：2026 年 10 月 9 日。`;
      }
    }
  }));

  const supportButtons = document.querySelectorAll('[data-support-path]');
  const supportCopies = document.querySelectorAll('[data-support-copy]');
  supportButtons.forEach(button => button.addEventListener('click', () => {
    const path = button.dataset.supportPath;
    supportButtons.forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    supportCopies.forEach(copy => { copy.hidden = copy.dataset.supportCopy !== path; });
  }));

  const shareButton = document.querySelector('#share-site');
  if (shareButton) shareButton.addEventListener('click', async () => {
    const shareData = {
      title: '把微光带进共和小学｜微光计划',
      text: '了解惠东县白盆珠镇共和村共和小学支教行动的五日安排、筹备进度与参与方式。',
      url: window.location.href.split('#')[0]
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        announce('分享面板已打开');
      } catch (error) {
        if (error?.name !== 'AbortError') announce('分享未能完成，请稍后重试');
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      announce('页面链接已复制，可以分享给朋友');
    } catch {
      const field = document.createElement('textarea');
      field.value = shareData.url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      announce(copied ? '页面链接已复制，可以分享给朋友' : '复制失败，请手动复制浏览器地址');
    }
  });

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealTargets = document.querySelectorAll('.section-label, .school-photo, .grade-chart, .timeline-item');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        if (entry.target.classList.contains('grade-chart')) entry.target.dataset.animated = 'true';
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
    revealTargets.forEach(target => observer.observe(target));
  } else {
    document.querySelector('.grade-chart')?.classList.add('is-visible');
  }
})();
