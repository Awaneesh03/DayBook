#!/usr/bin/env python3
import os

def build():
    src_dir = os.path.join(os.path.dirname(__file__), 'src')
    p1 = open(os.path.join(src_dir, 'p1_css_a.html')).read()
    p2 = open(os.path.join(src_dir, 'p2_css_b.html')).read()
    p3 = open(os.path.join(src_dir, 'p3_body.html')).read()

    scripts = [
        'j1_core.js', 'j2_paint.js', 'j3_data.js', 'j4_room.js',
        'j5_room_actions.js', 'j6_reader.js', 'j7_decor.js',
        'j8_pops.js', 'j9_studio.js', 'j10_library.js',
        'j12_turn.js', 'j11_boot.js'
    ]

    js_parts = []
    for s in scripts:
        js_parts.append(open(os.path.join(src_dir, s)).read())
    js_content = '\n'.join(js_parts)

    output = (
        p1 + p2 + p3 +
        '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n' +
        '<script>\n(function () {\n\'use strict\';\n' +
        js_content +
        '\n})();\n</script>\n'
    )

    out_path = os.path.join(os.path.dirname(__file__), 'index.html')
    with open(out_path, 'w') as f:
        f.write(output)
    print(f"Successfully built index.html ({len(output)} bytes)")

if __name__ == '__main__':
    build()
