from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text()
CSS = (ROOT / 'styles.css').read_text()
SCRIPT = (ROOT / 'script.js').read_text()


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.grades = []
        self.days = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ('href', 'src'):
            if values.get(key):
                self.references.append(values[key])
        if values.get('class') == 'grade-row' and values.get('data-grade'):
            self.grades.append(values)
        if values.get('class') == 'day-card':
            self.days.append(values)


class SiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = PageParser()
        cls.page.feed(HTML)

    def test_school_totals_match_all_grade_rows(self):
        self.assertEqual(len(self.page.grades), 6)
        self.assertEqual(sum(int(row['data-total']) for row in self.page.grades), 93)
        self.assertEqual(sum(int(row['data-boys']) for row in self.page.grades), 47)
        self.assertEqual(sum(int(row['data-girls']) for row in self.page.grades), 46)
        self.assertIn('校方确认：93 名学生', HTML)
        self.assertIn('原始材料中的“90 人”为此前记录', HTML)

    def test_local_assets_and_all_five_days_are_present(self):
        self.assertEqual([day['data-day'] for day in self.page.days], list('12345'))
        for reference in self.page.references:
            if reference.startswith(('http:', 'https:', 'mailto:', 'tel:', '#', 'data:')):
                continue
            path = urlsplit(reference).path
            self.assertTrue((ROOT / path).is_file(), reference)
        for photo in ('china-reading.jpg', 'china-community.jpg'):
            self.assertTrue((ROOT / 'assets' / photo).is_file())
            self.assertIn('assets/' + photo, CSS)
        self.assertTrue((ROOT / 'assets' / 'original-site' / 'teacher-classroom.jpg').is_file())

    def test_interaction_and_reduced_motion_are_available(self):
        for token in ('data-student-mode="gender"', 'data-progress-filter="confirmed"', 'data-support-path="materials"', 'id="share-site"'):
            self.assertIn(token, HTML)
        for token in ('navigator.share', 'navigator.clipboard', 'aria-current', 'aria-pressed'):
            self.assertIn(token, SCRIPT)
        self.assertIn('@media(prefers-reduced-motion:reduce)', CSS)

    def test_public_homepage_has_no_payment_entry(self):
        self.assertNotIn('donation.js', HTML)
        self.assertNotIn('support-modal', HTML)
        self.assertNotRegex(HTML, r'<(?:button|a)[^>]*>[^<]*生成捐赠订单')
        self.assertRegex(HTML, r'本网站目前不收款|当前状态：不收款')
        self.assertIn('非共和小学本次行动现场', HTML)

    def test_published_urls_and_not_found_page_match_repository(self):
        site_url = 'https://gjun0508.github.io/weiguang-volunteer/'
        self.assertIn(f'<link rel="canonical" href="{site_url}">', HTML)
        self.assertIn(f'<meta property="og:url" content="{site_url}">', HTML)
        self.assertIn(site_url, (ROOT / 'sitemap-0.xml').read_text())
        self.assertIn(site_url, (ROOT / 'robots.txt').read_text())
        self.assertIn('/weiguang-volunteer/', (ROOT / '404.html').read_text())
        self.assertIn('link[rel="canonical"]', SCRIPT)

    def test_weekly_schedule_is_draft_and_interactive_for_grades_four_to_six(self):
        self.assertIn('id="schedule"', HTML)
        self.assertLess(HTML.index('id="schedule"'), HTML.index('id="action"'))
        self.assertIn('课程筹备安排，具体以学校最终确认为准', HTML)
        self.assertIn('课表仅列出四至六年级', HTML)
        self.assertIn('暂无志愿课程安排', SCRIPT)
        self.assertIn('data-schedule-day', HTML)
        self.assertTrue('data-schedule-day="all"' in HTML, 'schedule should offer a full-week view')
        self.assertIn('data-schedule-grade', HTML)
        self.assertIn('scheduleData', SCRIPT)
        self.assertIn('8:40–9:20', SCRIPT)
        self.assertIn('14:10–14:50', SCRIPT)
        self.assertIn('没有说明时间与节次口径的关系', HTML)
        self.assertIn('上午 4 节、下午 2 节', HTML)
        self.assertIn('上午 3 节、下午 3 节', HTML)
        self.assertIn('周五下午', HTML)
        self.assertIn('周五下午 · 走访贫困家庭', HTML)
        self.assertRegex(CSS, r'#schedule\{[^}]*scroll-margin-top:')
        for grade in ('四年级', '五年级', '六年级'):
            self.assertIn(grade, HTML)
        for course in ('科学课', '梦想课', '全球视野与思维拓展', '体育课', '美术课'):
            self.assertIn(course, SCRIPT)

    def test_blue_closing_is_limited_to_support_section(self):
        self.assertIn('id="closing-title"', HTML)
        self.assertIn('世界因你我更美好', HTML)
        self.assertIn('Together, we make the world a better place.', HTML)
        self.assertEqual(HTML.count('class="closing-char"'), 8)
        self.assertIn('closing-character-in', CSS)
        self.assertIn('assets/closing-sky.jpg', CSS)
        self.assertIn('@media(prefers-reduced-motion:reduce)', CSS)
        self.assertIn('--paper:#f6f1e9', CSS)
        support_rules = list(re.finditer(r'\.support\s*\{([^}]*)\}', CSS))
        self.assertTrue(support_rules)
        support_rule = support_rules[-1].group(1)
        self.assertRegex(support_rule, r'background:\s*#e8e7da')
        self.assertNotIn('closing-sky', support_rule)
        closing_rules = list(re.finditer(r'\.closing-message\s*\{([^}]*)\}', CSS))
        self.assertTrue(closing_rules)
        closing_background = next((rule.group(1) for rule in closing_rules if 'closing-sky' in rule.group(1)), '')
        self.assertIn('background-color:#0d3152', closing_background)
        self.assertIn('background-image:', closing_background)
        self.assertNotIn('.support::before', CSS)
        self.assertLess(HTML.index('id="faq"'), HTML.index('id="support"'))


if __name__ == '__main__':
    unittest.main()
