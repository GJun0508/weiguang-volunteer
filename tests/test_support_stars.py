from pathlib import Path
import json
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / 'supabase' / 'support_stars.sql'
CONFIG_PATH = ROOT / 'supabase-config.js'
HTML_PATH = ROOT / 'index.html'
CSS_PATH = ROOT / 'support-stars.css'
SCRIPT_PATH = ROOT / 'support-stars.js'
NODE_PATH = shutil.which('node') or '/Users/hanyun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'


class SupportStarSchemaTests(unittest.TestCase):
    def run_node_json(self, expression):
        self.assertTrue(SCRIPT_PATH.is_file(), 'the shared support star script must exist')
        self.assertTrue(Path(NODE_PATH).is_file(), 'Node.js is required for support star behavior tests')
        source = f"const core = require('./support-stars.js');\nconst result = {expression};\nprocess.stdout.write(JSON.stringify(result));"
        result = subprocess.run([NODE_PATH, '-e', source], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

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

    def test_support_dialog_uses_original_site_paper_and_forest_palette(self):
        self.assertTrue(CSS_PATH.is_file(), 'the star dialog stylesheet must exist')
        css = CSS_PATH.read_text()
        self.assertRegex(css, r'background:\s*var\(--paper-bright\)')
        self.assertRegex(css, r'color:\s*var\(--ink\)')
        self.assertIn('var(--forest)', css)
        self.assertNotIn('background:#0e2940', css)
        self.assertNotIn('background:linear-gradient(145deg,rgba(17,49,74', css)
        self.assertRegex(css, r'\.support-stars-scene\s*\{')
        self.assertIn('url("assets/night-sky.jpg")', css)

    def test_opening_dialog_does_not_scroll_to_the_message_field(self):
        script = SCRIPT_PATH.read_text()
        open_dialog = script[script.index('function openDialog()'):script.index('function closeDialog()')]
        self.assertNotIn('messageInput?.focus', open_dialog)
        self.assertIn('closeButton?.focus({ preventScroll: true })', open_dialog)
        self.assertIn('dialog.scrollTop = 0;', open_dialog)

    def test_support_script_preserves_flight_and_shared_star_selection(self):
        self.assertTrue(SCRIPT_PATH.is_file(), 'the shared support star script must exist')
        script = SCRIPT_PATH.read_text()
        for behavior in ("createClient", "from('support_stars')", "postgres_changes", "requestAnimationFrame", "getContext('2d')", "addEventListener('click'", "showModal()", "textContent"):
            with self.subTest(behavior=behavior):
                self.assertIn(behavior, script)

    def test_existing_site_and_no_payment_notice_remain(self):
        html = HTML_PATH.read_text()
        for section_id in ('school', 'schedule', 'journey', 'progress', 'support'):
            with self.subTest(section=section_id):
                self.assertRegex(html, rf'<section\b[^>]*id="{section_id}"')
        self.assertRegex(html, r'href="mailto:[^"]+"')
        self.assertRegex(html, r'href="tel:[^"]+"')
        self.assertIn('当前状态：不收款', html)
        self.assertIn('不收款、不生成捐赠订单', html)
        dialog = html[html.index('<dialog'):html.index('</dialog>') + len('</dialog>')]
        self.assertNotRegex(dialog, r'<input\b[^>]*type="number"')
        self.assertNotRegex(dialog, r'<(?:button|a)\b[^>]*>[^<]*(?:支付|付款|生成.*?订单)')
        self.assertIn('id="share-site"', html)
        self.assertIn('世界因你我更美好', html)

    def test_support_message_is_rendered_as_plain_text(self):
        payload = '<img src=x onerror="alert(1)">'
        result = self.run_node_json(f"(() => {{ const target = {{ textContent: '' }}; core.writePlainText(target, {json.dumps(payload)}); return target.textContent; }})()")
        self.assertEqual(result, payload)

    def test_support_form_rejects_invalid_messages(self):
        result = self.run_node_json("['', '   ', 'a'.repeat(60), 'a'.repeat(61), '🌟'.repeat(60), '🌟'.repeat(61), '早安🌟'].map(core.validateSupportMessage)")
        self.assertEqual([item['valid'] for item in result], [False, False, True, False, True, False, True])
        self.assertEqual([item['length'] for item in result], [0, 0, 60, 61, 60, 61, 3])

    def test_failed_publish_is_local_only_and_not_counted(self):
        result = self.run_node_json("(() => { const store = core.createStarStore(); const star = { client_id: '9af1ee1b-41d4-4c77-92f9-500c79d12b58', support_type: '特色课程', message: '愿课堂里总有新的发现。', x: 42, y: 35, created_at: '2026-10-10T01:00:00Z' }; const status = core.recordLocalFallback(store, star); return { shared: store.sharedCount(), local: store.localStars().length, marked: store.localStars()[0].localOnly, status }; })()")
        self.assertEqual(result['shared'], 0)
        self.assertEqual(result['local'], 1)
        self.assertTrue(result['marked'])
        self.assertEqual(result['status'], '仅本机可见，未同步到共享星空')

    def test_snapshot_and_realtime_deduplicate_by_client_id(self):
        result = self.run_node_json("(() => { const store = core.createStarStore(); const row = { client_id: '9af1ee1b-41d4-4c77-92f9-500c79d12b58', support_type: '家庭走访', message: '愿每次倾听都有回应。', x: 42, y: 35, created_at: '2026-10-10T01:00:00Z' }; store.addShared(row); store.addShared({...row}); return { count: store.sharedCount(), rows: store.sharedStars().length }; })()")
        self.assertEqual(result, {'count': 1, 'rows': 1})

    def test_shared_star_store_keeps_only_the_latest_eighty(self):
        result = self.run_node_json("(() => { const store = core.createStarStore(80); for (let i = 0; i < 85; i += 1) store.addShared({ client_id: `9af1ee1b-41d4-4c77-92f9-${String(i).padStart(12, '0')}`, support_type: '物资准备', message: String(i), x: 50, y: 50, created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }); return { count: store.sharedCount(), oldest: store.sharedStars().at(-1).message, newest: store.sharedStars()[0].message }; })()")
        self.assertEqual(result, {'count': 80, 'oldest': '5', 'newest': '84'})


if __name__ == '__main__':
    unittest.main()
