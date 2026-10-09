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
        for photo in ('classroom-children.jpg', 'classroom-participation.jpg', 'teacher-classroom.jpg'):
            self.assertTrue((ROOT / 'assets' / 'original-site' / photo).is_file())

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


if __name__ == '__main__':
    unittest.main()
