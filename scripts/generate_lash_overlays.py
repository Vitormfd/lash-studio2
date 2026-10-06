"""
Gera os filtros de cílios (PNG transparente) do modo "Filtro manual" do Simulador.

Cada estilo vira uma imagem de UMA fileira de cílios vista de frente (canto interno
à esquerda, externo à direita), gerada pelo Google Gemini em fundo branco e
convertida para transparente. Também grava os pontos de encaixe (raiz no canto
interno e no externo) em public/lash-simulator/overlays/manifest.json.

Uso (na pasta lash-studio2), com a chave do Gemini copiada (Ctrl+C):
    python scripts/generate_lash_overlays.py              # gera os que faltam
    python scripts/generate_lash_overlays.py --only russo_gatinho --force
    python scripts/generate_lash_overlays.py --reprocess  # só refaz o recorte

A chave é lida da variável GEMINI_API_KEY ou da área de transferência e nunca é
gravada em arquivo. Custo aproximado: US$ 0,04 por estilo gerado.
Requer: Python 3.9+ e Pillow (pip install pillow).
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'public' / 'lash-simulator' / 'overlays'
RAW_DIR = ROOT / 'scripts' / '.cache' / 'lash-overlays-raw'
MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image')

# Cada estilo aponta para os ids do catálogo (src/features/lashSimulator/catalog.js),
# para o histórico salvar técnica, curvatura, espessura e mapeamento corretamente.
STYLES = [
    ('fio_a_fio_natural', 'Fio a Fio · Natural', 'classic one-by-one lash extensions, one fiber per natural lash, natural length mapping 8 to 11 mm, C curl, defined and clean',
     {'technique': 'fio_a_fio', 'volume': None, 'curl': 'C', 'thicknessMm': 0.15, 'mapping': 'natural', 'peakMm': 11}),
    ('fio_a_fio_boneca', 'Fio a Fio · Boneca', 'classic one-by-one lash extensions, D curl, doll-eye mapping with the longest lashes (12 mm) at the center',
     {'technique': 'fio_a_fio', 'volume': None, 'curl': 'D', 'thicknessMm': 0.15, 'mapping': 'boneca', 'peakMm': 12}),
    ('brasileiro_natural', 'Volume Brasileiro · Natural', 'Brazilian volume lash extensions made of Y-shaped fibers with two tips each, light and soft, C curl, natural mapping up to 11 mm',
     {'technique': 'volume_brasileiro', 'volume': 2, 'curl': 'C', 'thicknessMm': 0.07, 'mapping': 'natural', 'peakMm': 11}),
    ('russo_gatinho', 'Volume Russo · Gatinho', 'Russian volume lash extensions, fluffy hand-made 4D fans, C curl, cat-eye mapping getting longer toward the outer corner up to 12 mm',
     {'technique': 'volume_russo', 'volume': 4, 'curl': 'C', 'thicknessMm': 0.06, 'mapping': 'gatinho', 'peakMm': 12}),
    ('russo_boneca', 'Volume Russo · Boneca', 'Russian volume lash extensions, fluffy 4D fans, D curl, doll-eye mapping with the longest lashes at the center up to 12 mm',
     {'technique': 'volume_russo', 'volume': 4, 'curl': 'D', 'thicknessMm': 0.06, 'mapping': 'boneca', 'peakMm': 12}),
    ('egipcio_esquilo', 'Volume Egípcio · Esquilo', 'Egyptian volume lash extensions with W-shaped 3D fans, defined spiky look, D curl, squirrel mapping with the peak just before the outer corner up to 12 mm',
     {'technique': 'volume_egipcio', 'volume': 3, 'curl': 'D', 'thicknessMm': 0.07, 'mapping': 'esquilo', 'peakMm': 12}),
    ('ingles_olhar_aberto', 'Volume Inglês · Olhar Aberto', 'English volume lash extensions with pre-made 4D fans, CC curl, open-eye mapping with emphasis across the center up to 12 mm',
     {'technique': 'volume_ingles', 'volume': 4, 'curl': 'CC', 'thicknessMm': 0.07, 'mapping': 'olhar_aberto', 'peakMm': 12}),
    ('arabe_gatinho', 'Volume Árabe · Gatinho', 'Arabic volume lash extensions, dense pre-made 3D fans concentrated at the base giving a strong eyeliner effect, D curl, cat-eye mapping up to 12 mm',
     {'technique': 'volume_arabe', 'volume': 3, 'curl': 'D', 'thicknessMm': 0.07, 'mapping': 'gatinho', 'peakMm': 12}),
    ('hibrido_natural', 'Volume Híbrido · Natural', 'hybrid lash extensions mixing classic single lashes and light 3D volume fans, textured natural look, C curl, natural mapping up to 11 mm',
     {'technique': 'volume_hibrido', 'volume': 3, 'curl': 'C', 'thicknessMm': 0.07, 'classicThicknessMm': 0.15, 'mapping': 'natural', 'peakMm': 11}),
    ('mega_raposa', 'Mega Volume · Raposa (Fox)', 'mega volume lash extensions, very dense dark 8D fans, L+ curl, fox-eye mapping: short through the inner two-thirds then long lifted lashes on the outer third up to 13 mm',
     {'technique': 'mega_volume', 'volume': 8, 'curl': 'L+', 'thicknessMm': 0.03, 'mapping': 'raposa', 'peakMm': 13}),
    ('kim_k', 'Kim K', 'Kim K style lash extensions: a shorter fluffy base layer with longer closed wet-look spikes evenly spaced along the lash line, D curl, spikes up to 13 mm',
     {'technique': 'volume_russo', 'volume': 3, 'curl': 'D', 'thicknessMm': 0.07, 'mapping': 'kim_k', 'peakMm': 13}),
    ('wispy', 'Wispy', 'wispy lash extensions: feathery fluffy base with frequent longer spikes, C curl, up to 12 mm',
     {'technique': 'volume_russo', 'volume': 3, 'curl': 'C', 'thicknessMm': 0.06, 'mapping': 'wispy', 'peakMm': 12}),
]

PROMPT = (
    'Photorealistic macro product photo of ONE row of professional eyelash extensions for a single eye, '
    'seen from the front exactly as it looks applied on an upper eyelid in a frontal portrait photo. '
    'The lash roots form a smooth, gently curved line along the bottom of the image (like the upper lid margin). '
    'The INNER corner is on the LEFT with shorter lashes; the OUTER corner is on the RIGHT where the lashes sweep outward. '
    'Lashes fan upward and outward with realistic curl and perspective. Style: {style}. '
    'Deep black synthetic fibers with fine tapered tips and natural irregularity, sharp focus. '
    'Isolated on a pure flat white background (#FFFFFF). No eye, no skin, no eyelid, no visible glue band, '
    'no shadows, no reflections, no text, no props. The lash row fills about 80% of the image width.'
)


def read_api_key():
    key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not key and sys.platform == 'win32':
        try:
            key = subprocess.run(['powershell', '-NoProfile', '-Command', 'Get-Clipboard -Raw'],
                                 capture_output=True, text=True, timeout=15).stdout
        except Exception:
            key = ''
    key = re.sub(r'^\s*GEMINI_API_KEY\s*=\s*', '', key or '')
    key = re.sub(r'[^\x21-\x7E]', '', key).strip('"\'')
    return key


def call_gemini(key, prompt):
    body = json.dumps({
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '16:9'}},
    }).encode()
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
        data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key}, method='POST')
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=90) as res:
                payload = json.loads(res.read())
            for part in payload.get('candidates', [{}])[0].get('content', {}).get('parts', []):
                inline = part.get('inlineData') or part.get('inline_data')
                if inline and inline.get('data'):
                    return base64.b64decode(inline['data'])
            raise RuntimeError(f'sem imagem na resposta: {json.dumps(payload)[:300]}')
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors='ignore')[:300]
            if err.code in (429, 500, 503) and attempt == 0:
                time.sleep(3)
                continue
            raise RuntimeError(f'Gemini HTTP {err.code}: {detail}')
    raise RuntimeError('Gemini falhou')


def to_transparent(raw_path, out_path):
    """Fundo branco → transparente. Opacidade = quão escuro é o pixel (fios finos ficam suaves)."""
    img = Image.open(raw_path).convert('RGB')
    gray = img.convert('L')
    # Normaliza o branco do fundo (percentil alto) para não deixar véu cinza.
    hist = gray.histogram()
    total = sum(hist)
    acc, white = 0, 255
    for value in range(255, -1, -1):
        acc += hist[value]
        if acc > total * 0.35:
            white = value
            break
    white = max(white, 200)
    alpha = gray.point(lambda v: 0 if v >= white - 6 else min(255, int((white - 6 - v) * 255 / max(1, white - 70))))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    rgba = Image.new('RGBA', img.size, (14, 10, 12, 0))
    rgba.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 18 else 0).getbbox()
    if not bbox:
        raise RuntimeError('imagem vazia após remover o fundo')
    pad = 6
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(img.width, bbox[2] + pad), min(img.height, bbox[3] + pad))
    rgba = rgba.crop(bbox)
    if rgba.width > 1200:
        rgba = rgba.resize((1200, round(rgba.height * 1200 / rgba.width)), Image.LANCZOS)
    rgba.save(out_path, optimize=True)

    # Pontos de encaixe: a linha das raízes é o ponto mais baixo com fios em cada coluna.
    a = rgba.getchannel('A')
    w, h = a.size
    px = a.load()

    def root_y(x):
        for y in range(h - 1, -1, -1):
            if px[x, y] > 90:
                return y
        return None

    def anchor(fraction, direction):
        x = int(w * fraction)
        while 0 <= x < w:
            y = root_y(x)
            if y is not None:
                return [round(x / w, 4), round(y / h, 4)]
            x += direction
        return [fraction, 0.95]

    return {'inner': anchor(0.06, 1), 'outer': anchor(0.86, -1), 'width': w, 'height': h}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='*')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--reprocess', action='store_true')
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'overlays': []}
    by_id = {item['id']: item for item in manifest.get('overlays', [])}

    styles = [s for s in STYLES if not args.only or s[0] in args.only]
    key = '' if args.reprocess else read_api_key()
    if not args.reprocess and len(key) < 20:
        print('Chave do Gemini não encontrada. Copie a chave (Ctrl+C) ou defina GEMINI_API_KEY e rode de novo.')
        sys.exit(1)

    for style_id, label, description, settings in styles:
        raw_path = RAW_DIR / f'{style_id}.png'
        out_path = OUT_DIR / f'{style_id}.png'
        try:
            if not args.reprocess and (args.force or not raw_path.exists()):
                print(f'Gerando {label}...')
                raw_path.write_bytes(call_gemini(key, PROMPT.format(style=description)))
            if not raw_path.exists():
                print(f'  pulando {label}: sem imagem gerada')
                continue
            anchors = to_transparent(raw_path, out_path)
            by_id[style_id] = {
                'id': style_id,
                'label': label,
                'file': f'/lash-simulator/overlays/{style_id}.png',
                'anchors': {'inner': anchors['inner'], 'outer': anchors['outer']},
                'size': [anchors['width'], anchors['height']],
                'settings': settings,
                'source': f'Gerado com {MODEL}',
            }
            print(f'  ok: {out_path.name}')
        except Exception as error:  # segue para o próximo estilo
            print(f'  ERRO em {label}: {error}')

    order = [s[0] for s in STYLES]
    manifest['overlays'] = sorted(by_id.values(), key=lambda item: order.index(item['id']) if item['id'] in order else 999)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Manifesto: {manifest_path} ({len(manifest["overlays"])} filtros)')


if __name__ == '__main__':
    main()
