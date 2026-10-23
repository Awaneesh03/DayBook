#!/usr/bin/env python3
import os

def build():
    src_dir = os.path.join(os.path.dirname(__file__), 'src')
    p1 = open(os.path.join(src_dir, 'p1_css_a.html'), encoding='utf-8').read()
    p2 = open(os.path.join(src_dir, 'p2_css_b.html'), encoding='utf-8').read()
    p3 = open(os.path.join(src_dir, 'p3_body.html'), encoding='utf-8').read()

    scripts = [
        'j1_core.js', 'j2_paint.js', 'j3_data.js', 'j4_room.js',
        'j5_room_actions.js', 'j6_reader.js', 'j7_decor.js',
        'j8_pops.js', 'j9_studio.js', 'j10_library.js',
        'j12_turn.js', 'j13_planner.js', 'j11_boot.js'
    ]

    js_parts = []
    for s in scripts:
        js_parts.append(open(os.path.join(src_dir, s), encoding='utf-8').read())
    js_content = '\n'.join(js_parts)

    output = (
        p1 + p2 + p3 +
        # integrity: the browser refuses the file if the CDN ever serves anything but three.js r128 (hash from cdnjs)
        '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" integrity="sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>\n' +
        '<script>\n(function () {\n\'use strict\';\n' +
        js_content +
        '\n})();\n</script>\n'
    )

    out_path = os.path.join(os.path.dirname(__file__), 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(output)
    print(f"Successfully built index.html ({len(output)} bytes)")

if __name__ == '__main__':
    build()
