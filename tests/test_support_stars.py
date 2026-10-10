from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / 'supabase' / 'support_stars.sql'
CONFIG_PATH = ROOT / 'supabase-config.js'
HTML_PATH = ROOT / 'index.html'
CSS_PATH = ROOT / 'support-stars.css'


class SupportStarSchemaTests(unittest.TestCase):
    def test_support_star_schema_is_separate_and_read_insert_only(self):
        self.assertTrue(SQL_PATH.is_file(), 'the dedicated support stars migration must exist')
        sql = SQL_PATH.read_text()
        created_tables = re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)', sql, re.I)
        self.assertEqual(created_tables, ['public.support_stars'])
        self.assertRegex(sql, r'alter\s+table\s+public\.support_stars\s+enable\s+row\s+level\s+security', re.I)
        policies = re.findall(r'create\s+policy\s+([\w]+)[\s\S]*?on\s+public\.support_stars[\s\S]*?for\s+(select|insert|update|delete|all)', sql, re.I)
        self.assertEqual({command.lower() for _, command in policies}, {'select', 'insert'})
        self.assertRegex(sql, r'grant\s+select\s+on\s+table\s+public\.support_stars\s+to\s+anon', re.I)
        self.assertRegex(sql, r'grant\s+insert\s*\([^)]*\)\s+on\s+table\s+public\.support_stars\s+to\s+anon', re.I)
        self.assertNotRegex(sql, r'grant\s+(?:all|update|delete|insert\s+on)\b[^;]*\bto\s+anon', re.I)
        self.assertNotIn('donation_stars', sql)
        for private_or_payment_field in ('amount', 'anonymous_label', 'nickname', 'phone', 'email'):
            self.assertNotRegex(sql, rf'\b{private_or_payment_field}\b', re.I)
        self.assertNotRegex(sql, r'create\s+policy\s+\w+[\s\S]*?for\s+(?:update|delete)', re.I)

    def test_support_star_schema_constrains_message_length_and_fields(self):
        self.assertTrue(SQL_PATH.is_file(), 'the dedicated support stars migration must exist')
        self.assertTrue(CONFIG_PATH.is_file(), 'the browser-safe Supabase config must exist')
        sql = SQL_PATH.read_text()
        columns = re.search(r'create\s+table\s+(?:if\s+not\s+exists\s+)?public\.support_stars\s*\((.*?)\n\);', sql, re.I | re.S)
        self.assertIsNotNone(columns)
        declared = re.findall(r'^\s*([a-z_]+)\s+', columns.group(1), re.I | re.M)
        self.assertEqual(set(declared), {'id', 'client_id', 'support_type', 'message', 'x', 'y', 'created_at'})
        self.assertRegex(sql, r"support_type\s+in\s*\(\s*'特色课程'\s*,\s*'家庭走访'\s*,\s*'物资准备'\s*\)", re.I)
        self.assertRegex(sql, r'char_length\s*\(\s*btrim\s*\(\s*message\s*\)\s*\)\s+between\s+1\s+and\s+60', re.I)
        for coordinate in ('x', 'y'):
            self.assertRegex(sql, rf'\b{coordinate}\b[^,\n]*check|check\s*\([^)]*\b{coordinate}\b[^)]*between\s+0\s+and\s+100', re.I | re.S)
        config = CONFIG_PATH.read_text()
        self.assertRegex(config, r"url:\s*'https://rqvcoygrjjqqfyikijah\.supabase\.co'")
        self.assertIn('publishableKey', config)
        self.assertIn('sb_publishable_', config)
        self.assertNotRegex(config, r'(?im)^\s*(?:service[_ -]?role|secret|private[_ -]?key)\s*[:=]')

    def test_support_dialog_discloses_public_message_and_confirmation(self):
        html = HTML_PATH.read_text()
        self.assertIn('data-support-stars-open', html)
        self.assertRegex(html, r'<dialog\b[^>]*id="support-stars-dialog"[^>]*aria-labelledby=')
        self.assertEqual(len(re.findall(r'data-support-type=', html)), 3)
        self.assertRegex(html, r'<textarea\b[^>]*id="support-star-message"[^>]*maxlength="120"')
        self.assertIn('data-message-count', html)
        self.assertIn('60 个 Unicode 字符', html)
        self.assertRegex(html, r'<input\b[^>]*type="checkbox"[^>]*id="support-star-public-confirm"[^>]*required')
        self.assertIn('星星和留言会公开显示', html)
        self.assertIn('不代表捐款或物资已经送达', html)
        self.assertIn('不要填写真实姓名、联系方式、住址或儿童可识别信息', html)
        self.assertRegex(html, r'role="status"[^>]*aria-live="polite"')
        dialog = html[html.index('<dialog'):html.index('</dialog>') + len('</dialog>')]
        self.assertNotRegex(dialog, r'<input\b[^>]*type="number"')
        self.assertNotRegex(dialog, r'<button\b[^>]*>[^<]*(?:支付|付款|生成.*?订单)')

    def test_support_dialog_has_keyboard_and_reduced_motion_support(self):
        html = HTML_PATH.read_text()
        self.assertTrue(CSS_PATH.is_file(), 'the star dialog stylesheet must exist')
        css = CSS_PATH.read_text()
        self.assertRegex(html, r'<dialog\b[^>]*id="support-stars-dialog"[^>]*aria-describedby=')
        self.assertRegex(html, r'<button\b[^>]*data-support-stars-close[^>]*>')
        self.assertIn('data-support-stars-open', html)
        self.assertRegex(css, r'@media\s*\(prefers-reduced-motion:\s*reduce\)')
        self.assertRegex(css, r'@media\s*\(max-width:\s*760px\)')
        self.assertIn('.support-stars-dialog::backdrop', css)


if __name__ == '__main__':
    unittest.main()
