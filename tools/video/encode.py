#!/usr/bin/env python3
"""Encode recorded frames into an H.264 MP4 with burnt-in captions and fades.

    python tools/video/encode.py <outDir> <output.mp4>
"""
import json
import os
import subprocess
import sys
from pathlib import Path

out_dir = Path(sys.argv[1])
target = Path(sys.argv[2])
meta = json.loads((out_dir / 'captions.json').read_text())
fps = meta['fps']
duration = meta['frames'] / fps
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def escape(text: str) -> str:
    return text.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%')


filters = []
for caption in meta['captions']:
    start, end = caption['start'], caption['end']
    # Fade each caption in and out over a quarter second.
    alpha = f"if(lt(t,{start}+0.25),(t-{start})/0.25,if(gt(t,{end}-0.25),({end}-t)/0.25,1))"
    filters.append(
        f"drawtext=fontfile={font}:text='{escape(caption['text'])}':fontsize=34:fontcolor=white"
        f":box=1:boxcolor=0x0b1626@0.72:boxborderw=18:x=(w-text_w)/2:y=h-text_h-56"
        f":alpha='{alpha}':enable='between(t,{start},{end})'"
    )
filters.append('fade=t=in:st=0:d=0.6')
filters.append(f'fade=t=out:st={max(0, duration - 0.8):.3f}:d=0.8')
filters.append('format=yuv420p')

temporary = target.with_name(target.stem + '.partial.mp4')
subprocess.run([
    'ffmpeg', '-y', '-framerate', str(fps), '-i', str(out_dir / 'frames' / '%05d.jpg'),
    '-vf', ','.join(filters), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(temporary),
], check=True)
os.replace(temporary, target)
print(f'wrote {target} ({target.stat().st_size} bytes, {duration:.1f}s)')
