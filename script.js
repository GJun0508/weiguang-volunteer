(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  window.addEventListener('pageshow', event => {
    if (location.hash || event.persisted || navigation?.type === 'back_forward') return;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousBehavior;
  }, { once: true });

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

  const scheduleData = {
    1: {
      4: [null, null, null, null, '科学课', '梦想课'],
      5: [null, '全球视野与思维拓展', '数学课', '语文课', '英语课', '英语课'],
      6: ['科学课', null, '科学课', '美术课', '数学课', '全球视野与思维拓展']
    },
    2: {
      4: [null, '体育课', '体育课', null, null, '数学课'],
      5: [null, null, null, null, '美术课', '全球视野与思维拓展'],
      6: [null, '英语课', '英语课', '全球视野与思维拓展', null, '科学课']
    },
    3: {
      4: [null, null, null, null, null, '美术课'],
      5: [null, '体育课', '体育课', null, '英语课', '英语课'],
      6: [null, '体育课', '体育课', null, '科学课', '语文课']
    },
    4: {
      4: [null, null, '数学课', null, null, null],
      5: [null, '语文课', '科学课', '全球视野与思维拓展', '数学课', '梦想课'],
      6: ['科学课', '英语课', '英语课', '梦想课', '科学课', '语文课']
    },
    5: {
      4: [null, null, '科学课', null, null, null],
      5: ['科学课', null, null, null, null, null],
      6: [null, '数学课', '全球视野与思维拓展', null, null, null]
    }
  };
  const schedulePeriods = [
    { label: '上午第一节', time: '8:40–9:20', group: '上午' },
    { label: '上午第二节', time: '9:35–10:15', group: '上午' },
    { label: '上午第三节', time: '10:30–11:10', group: '上午' },
    { label: '下午第一节', time: '14:10–14:50', group: '下午' },
    { label: '下午第二节', time: '15:05–15:45', group: '下午' },
    { label: '下午第三节', time: '16:00–16:40', group: '下午' }
  ];
  const scheduleDayLabels = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五' };
  const scheduleGradeLabels = { 4: '四年级', 5: '五年级', 6: '六年级' };
  const scheduleRoot = document.querySelector('#schedule');
  const scheduleResults = document.querySelector('#schedule-results');
  const scheduleDayButtons = document.querySelectorAll('[data-schedule-day]');
  const scheduleGradeButtons = document.querySelectorAll('[data-schedule-grade]');
  let selectedScheduleDay = window.matchMedia('(max-width: 760px)').matches ? '1' : 'all';
  let selectedScheduleGrade = '6';
  function renderScheduleDay(day, grade) {
    const courses = scheduleData[day]?.[grade] || [];
    const rows = schedulePeriods.map((period, index) => {
      const course = courses[index];
      const courseContent = course
        ? `<details class="schedule-course"><summary>${course}<span>课程说明＋</span></summary><p>本页仅展示团队提供周课表中的课程名称；具体教学内容与安排以学校最终确认版本为准。</p></details>`
        : '<span class="schedule-empty">暂无志愿课程安排</span>';
      return `<li class="schedule-period"><div class="schedule-period-time"><b>${period.label}</b><time>${period.time}</time></div><div class="schedule-period-course">${courseContent}</div></li>`;
    });
    const morning = rows.slice(0, 3).join('');
    const afternoon = rows.slice(3).join('');
    return `<div class="schedule-session"><h3>上午</h3><ol>${morning}</ol></div><div class="schedule-session"><h3>下午</h3><ol>${afternoon}</ol></div>`;
  }
  function renderSchedule() {
    if (!scheduleResults) return;
    const dayLabel = selectedScheduleDay === 'all' ? '本周' : scheduleDayLabels[selectedScheduleDay];
    const view = selectedScheduleDay === 'all'
      ? `<div class="schedule-week-overview">${Object.entries(scheduleDayLabels).map(([day, label]) => `<section class="schedule-day-overview" aria-label="${label}课程"><h3>${label}</h3>${renderScheduleDay(day, selectedScheduleGrade)}</section>`).join('')}</div>`
      : renderScheduleDay(selectedScheduleDay, selectedScheduleGrade);
    scheduleResults.innerHTML = `<p class="schedule-status" role="status" aria-live="polite">正在查看${dayLabel} · ${scheduleGradeLabels[selectedScheduleGrade]}筹备课程</p>${view}`;
    scheduleDayButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scheduleDay === selectedScheduleDay)));
    scheduleGradeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scheduleGrade === selectedScheduleGrade)));
    scheduleResults.classList.remove('is-updating');
    requestAnimationFrame(() => scheduleResults.classList.add('is-updating'));
  }
  scheduleDayButtons.forEach(button => button.addEventListener('click', () => {
    selectedScheduleDay = button.dataset.scheduleDay;
    renderSchedule();
  }));
  scheduleGradeButtons.forEach(button => button.addEventListener('click', () => {
    selectedScheduleGrade = button.dataset.scheduleGrade;
    renderSchedule();
  }));
  if (scheduleRoot && scheduleResults) renderSchedule();

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
        progressEmpty.textContent = `暂无${labels[filter] || ''}记录。最近更新时间：2026 年 10 月 10 日。`;
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
      url: document.querySelector('link[rel="canonical"]')?.href || window.location.href.split('#')[0]
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
    const supportSection = document.querySelector('.support');
    if (supportSection) supportSection.dataset.motionReady = 'true';
    const revealTargets = document.querySelectorAll('.section-label, .school-photo, .grade-chart, .timeline-item, .support');
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
