"""Recupera las fichas originales del HTML para no duplicarlas en el ZIP."""
from pathlib import Path
import base64
import json
import re
import struct


def restore_assets(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parent
    catalog = json.loads((root / 'data/fichas.json').read_text(encoding='utf-8'))
    missing = [sheet for sheet in catalog if not (root / 'assets/fichas' / sheet['file']).exists()]
    if not missing:
        return 0
    app = root.parent.parent / 'Panel-Ventas-Daniel.html'
    if not app.is_file():
        raise FileNotFoundError('Conservá Panel-Ventas-Daniel.html en la carpeta principal del proyecto.')
    html = app.read_text(encoding='utf-8')
    for sheet in missing:
        pattern = r'<script[^>]*id="technical-sheet-' + re.escape(sheet['id']) + r'"[^>]*>(.*?)</script>'
        match = re.search(pattern, html, re.S)
        if match is None:
            raise ValueError('No se encontró la ficha original de ' + sheet['title'])
        image = base64.b64decode(match.group(1).strip(), validate=True)
        if image[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError('La ficha no es un PNG válido: ' + sheet['title'])
        if struct.unpack('>II', image[16:24]) != (sheet['width'], sheet['height']):
            raise ValueError('La ficha tiene dimensiones inesperadas: ' + sheet['title'])
        dest = root / 'assets/fichas' / sheet['file']
        dest.parent.mkdir(parents=True, exist_ok=True)
        temporary = dest.with_suffix('.restoring')
        temporary.write_bytes(image)
        temporary.replace(dest)
    return len(missing)


if __name__ == '__main__':
    print('Fichas recuperadas:', restore_assets())
