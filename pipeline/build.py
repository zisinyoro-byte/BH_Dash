#!/usr/bin/env python3
"""Assemble the self-contained dashboard HTML (inline echarts + data + app js)."""
import argparse
from pathlib import Path

DEFAULT_BASE = Path('/home/z/my-project/scripts/dashboard')
DEFAULT_DATA = DEFAULT_BASE / 'data.json'
DEFAULT_OUT = Path('/home/z/my-project/download/btts_dashboard.html')


def run(base, data_path, out):
    """Inline template.html + echarts.min.js + data.json + app.js into one HTML."""
    base, data_path, out = Path(base), Path(data_path), Path(out)
    template = (base / 'template.html').read_text(encoding='utf-8')
    echarts = (base / 'echarts.min.js').read_text(encoding='utf-8')
    data = data_path.read_text(encoding='utf-8')
    app = (base / 'app.js').read_text(encoding='utf-8')

    # safety: '</script>' must not appear inside inlined scripts
    for name, blob in [('echarts', echarts), ('data', data), ('app', app)]:
        if '</script>' in blob.lower():
            raise SystemExit(f'FATAL: closing script tag found inside {name} payload')

    html = (template
            .replace('{{ECHARTS_JS}}', echarts)
            .replace('{{DATA_JSON}}', data)
            .replace('{{APP_JS}}', app))

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'wrote {out} ({out.stat().st_size/1024:.0f} KB)')


def main():
    ap = argparse.ArgumentParser(description='Dashboard single-file builder')
    ap.add_argument('--base', default=str(DEFAULT_BASE),
                    help='directory with template.html / app.js / echarts.min.js')
    ap.add_argument('--data', default=str(DEFAULT_DATA), help='data.json path')
    ap.add_argument('--out', default=str(DEFAULT_OUT), help='output HTML path')
    args = ap.parse_args()
    run(args.base, args.data, args.out)


if __name__ == '__main__':
    main()
