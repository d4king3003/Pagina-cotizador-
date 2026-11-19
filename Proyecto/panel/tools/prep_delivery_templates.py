"""Prepara los documentos de entrega de la moto (carta de entrega y autorización de primera matrícula).

Uso: python3 tools/prep_delivery_templates.py <carpeta con carta.docx y matricula.docx>

Genera en assets/delivery/:
- <doc>.json: el Word original sin datos de ejemplo, con marcas {{campo}} (descarga en Word).
- <doc>-fondo-<n>.jpg y <doc>-layout.json: cada hoja en blanco y cómo escribir cada párrafo con datos (PDF directo).
Los campos de combinación (MERGEFIELD) se vuelven texto con marca y se quita la conexión al Excel Base.xlsx.
"""
import base64, copy, json, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from lxml import etree
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/delivery'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
Q = '{%s}' % W

FIELDS = {
    'Nombre_cliente_': 'name', 'Modelo_numerico_': 'model', 'POLIZA_NUMERICO': 'poliza', 'DUI_NUMERICO': 'dui', 'Color': 'color',
    'Precio': 'priceWords', 'MOTOR_NUMERICO': 'motor', 'CHASIS_NUMERICO': 'chasis', 'Año': 'year', 'Dia': 'dayWords', 'DIA': 'dayWords',
    'Mes': 'month', 'Ocupacion': 'occupation', 'municipio': 'municipio', 'departamento': 'departamento', 'DUI': 'duiWords',
    'Poliza': 'polizaWords', 'Modelo': 'modelWords', 'Motor_': 'motorWords', 'Chasis': 'chasisWords', 'NIT': 'duiWords', 'Edad': 'ageWords',
}
# Valores de ejemplo (largo típico) para dibujar las hojas en blanco y medir dónde va cada párrafo.
SAMPLE = {
    'name': 'CARLOS ANTONIO TORRES MARTINEZ', 'model': 'APACHE RTR 160 2V REF', 'poliza': '4-38361', 'dui': '03619507-9',
    'color': 'NEGRO FRANJAS Y LETRAS MULTICOLOR', 'priceWords': 'DOS MIL NOVENTA Y NUEVE', 'motor': 'DE4AV21D5244',
    'chasis': 'MD634KE47V2AJ9001', 'year': '2027', 'dayWords': 'VEINTICINCO', 'month': 'NOVIEMBRE', 'occupation': 'JORNALERO',
    'municipio': 'USULUTAN', 'departamento': 'USULUTAN', 'duiWords': 'CERO TRES SEIS UNO NUEVE CINCO CERO SIETE - NUEVE',
    'polizaWords': 'CUATRO - TRES OCHO TRES SEIS UNO', 'modelWords': 'APACHE RTR UNO SEIS CERO DOS V REF',
    'motorWords': 'D E CUATRO A V DOS UNO D CINCO DOS CUATRO CUATRO', 'chasisWords': 'M D SEIS TRES CUATRO K E CUATRO SIETE V DOS A J NUEVE CERO CERO UNO',
    'dateLong': '16 DE NOVIEMBRE DE 2026', 'yearWords': 'DOS MIL VEINTISEIS', 'motoYearWords': 'DOS MIL VEINTISIETE',
    'prima': '$367.07', 'plan': 'SIETE TRES 47%', 'payment': '$99.62', 'months': '24', 'balance': '$1,531.93',
    'xContado': 'X', 'xCredito': 'X', 'financiera': 'CREDIOPCIONES',
    'docDateWords': 'diecinueve de noviembre de dos mil veintiseis', 'purchaseDateWords': 'treinta de septiembre de dos mil veintiseis', 'age': '23',
}


def text_of(p):
    return ''.join(t.text or '' for t in p.iter(Q + 't'))


def collapse_fields(root):
    """Cambia cada campo MERGEFIELD por una sola corrida con la marca {{campo}} (mismo formato que el resultado)."""
    for p in root.iter(Q + 'p'):
        runs = list(p)
        i = 0
        while i < len(runs):
            r = runs[i]
            fc = r.find(Q + 'fldChar') if r.tag == Q + 'r' else None
            if fc is None or fc.get(Q + 'fldCharType') != 'begin':
                i += 1
                continue
            j, instr, result_rpr, depth = i + 1, '', None, 1
            phase = 'instr'
            while j < len(runs) and depth:
                rr = runs[j]
                f2 = rr.find(Q + 'fldChar') if rr.tag == Q + 'r' else None
                if f2 is not None:
                    kind = f2.get(Q + 'fldCharType')
                    if kind == 'begin':
                        depth += 1
                    elif kind == 'end':
                        depth -= 1
                    elif kind == 'separate' and depth == 1:
                        phase = 'result'
                elif rr.tag == Q + 'r':
                    it = rr.find(Q + 'instrText')
                    if it is not None and phase == 'instr':
                        instr += it.text or ''
                    if phase == 'result' and result_rpr is None and rr.find(Q + 't') is not None:
                        result_rpr = rr.find(Q + 'rPr')
                j += 1
            m = re.match(r'\s*MERGEFIELD\s+"?([^"\s]+)"?', instr)
            if not m:
                i = j
                continue
            key = FIELDS[m.group(1)]
            new = etree.Element(Q + 'r')
            rpr = result_rpr if result_rpr is not None else r.find(Q + 'rPr')
            if rpr is not None:
                new.append(copy.deepcopy(rpr))
            t = etree.SubElement(new, Q + 't')
            t.text = '{{%s}}' % key
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            for k in range(i, j):
                p.remove(runs[k])
            p.insert(list(p).index(runs[j]) if j < len(runs) else len(p), new)
            runs = list(p)
            i = runs.index(new) + 1


def replace_text(root, old, new, count=None):
    """Reemplaza texto que está dentro de una sola corrida <w:t>."""
    n = 0
    for t in root.iter(Q + 't'):
        if t.text and old in t.text:
            t.text = t.text.replace(old, new)
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            n += 1
    if not n:
        # El texto está repartido en varias corridas: se escribe en la corrida donde empieza y se borra del resto.
        for p in root.iter(Q + 'p'):
            if p.find('.//' + Q + 'p') is not None:
                continue
            while old in text_of(p):
                ts = [t for t in p.iter(Q + 't') if t.text]
                full = ''.join(t.text for t in ts)
                start = full.index(old)
                end = start + len(old)
                pos = 0
                for t in ts:
                    a, b = pos, pos + len(t.text)
                    pos = b
                    if b <= start or a >= end:
                        continue
                    keep_l = t.text[:max(0, start - a)]
                    keep_r = t.text[max(0, end - a):] if end < b else ''
                    t.text = keep_l + (new if a <= start < b else '') + keep_r
                    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                n += 1
    assert n and (count is None or n == count), (old, n)


def fill_cell_after(root, label, token):
    """Escribe la marca en la celda que está a la derecha de la celda con ese texto."""
    for tc in root.iter(Q + 'tc'):
        if text_of(tc).strip() == label:
            nxt = tc.getnext()
            while nxt is not None and nxt.tag != Q + 'tc':
                nxt = nxt.getnext()
            p = nxt.find(Q + 'p')
            lab_r = next(r for r in tc.iter(Q + 'r') if r.find(Q + 't') is not None)
            for r in p.findall(Q + 'r'):
                p.remove(r)
            r = etree.SubElement(p, Q + 'r')
            rpr = lab_r.find(Q + 'rPr')
            if rpr is not None:
                r.append(copy.deepcopy(rpr))
            t = etree.SubElement(r, Q + 't')
            t.text = '{{%s}}' % token
            return
    raise AssertionError(label)


def prepare(src, kind):
    with zipfile.ZipFile(src) as z:
        entries = {i.filename: z.read(i.filename) for i in z.infolist()}
    root = etree.fromstring(entries['word/document.xml'])
    collapse_fields(root)
    if kind == 'carta':
        replace_text(root, '16 DE NOVIEMBRE DE 2026', '{{dateLong}}', 2)
        for label, tok in (('Prima o Enganche', 'prima'), ('Plan seleccionado', 'plan'), ('Cuotas/Pagos de', 'payment'),
                           ('Plazo (meses)', 'months'), ('Saldo para financiar', 'balance'), ('Crédito', 'xCredito')):
            fill_cell_after(root, label, tok)
        for tc in root.iter(Q + 'tc'):
            if text_of(tc).strip() == 'X':
                replace_text(tc, 'X', '{{xContado}}', 1)
                break
        for tc in root.iter(Q + 'tc'):
            if text_of(tc).strip() == 'CREDIOPCIONES':
                for t in list(tc.iter(Q + 't')):
                    t.text = ''
                next(tc.iter(Q + 't')).text = '{{financiera}}'
                break
    elif kind == 'compraventa':
        # El año de la fecha estaba escrito fijo («DOS MIL VEINTISEIS»): usa el año de la fecha del IPM.
        replace_text(root, 'DOS MIL VEINTISEIS', '{{yearWords}}', 2)
    elif kind == 'exoneracion':
        # Fechas y edad que en la plantilla estaban escritas fijas
        replace_text(root, 'seis de octubre de dos mil veintiseis', '{{docDateWords}}', 1)
        replace_text(root, 'treinta de septiembre de dos mil veintiseis', '{{purchaseDateWords}}', 1)
        replace_text(root, 'veintidos de septiembre de dos mil veintiseis', '{{docDateWords}}', 1)
        replace_text(root, '23.0', '{{age}}', 1)
    else:
        replace_text(root, 'DOS MIL VEINTISEIS', '{{yearWords}}')
        fix_year(root)
        replace_text(root, 'ESTUDIANTE', '{{occupation}}', 1)
    entries['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    # Sin conexión al Excel de la combinación de correspondencia: Word ya no pregunta por Base.xlsx al abrir.
    st = entries['word/settings.xml'].decode()
    if '<w:mailMerge>' in st:
        st = re.sub(r'<w:mailMerge>.*?</w:mailMerge>', '', st, flags=re.S)
        entries.pop('word/_rels/settings.xml.rels', None)
    entries['word/settings.xml'] = st.encode()
    st2 = entries['word/settings.xml'].decode()
    assert 'r:id=' not in st2 or 'attachedTemplate' in st2
    return entries


def fix_year(root):
    """«Año: DEPORTIVA» de la plantilla pasa a llevar el año de la moto en letras."""
    for t in root.iter(Q + 't'):
        if t.text and 'Año:' in t.text:
            nxt = t
            # El texto puede seguir en la corrida siguiente
            if 'DEPORTIVA' in t.text:
                t.text = re.sub(r'Año:\s*DEPORTIVA', 'Año: {{motoYearWords}}', t.text, count=1)
                return
            run = t.getparent().getnext()
            while run is not None:
                tt = run.find(Q + 't')
                if tt is not None and tt.text and 'DEPORTIVA' in tt.text:
                    tt.text = tt.text.replace('DEPORTIVA', '{{motoYearWords}}', 1)
                    return
                run = run.getnext()
    raise AssertionError('No encontré «Año: DEPORTIVA»')


def is_flow(p):
    """Párrafos justificados (texto corrido): se redibujan completos. Los demás: solo se escriben los datos."""
    jc = p.find(Q + 'pPr/' + Q + 'jc')
    return jc is not None and jc.get(Q + 'val') == 'both'


def target_paragraphs(root):
    for idx, p in enumerate(root.iter(Q + 'p')):
        if '{{' in text_of(p) and p.find('.//' + Q + 'p') is None:
            yield idx, p


def set_color(r, color):
    rpr = r.find(Q + 'rPr')
    if rpr is None:
        rpr = etree.Element(Q + 'rPr')
        r.insert(0, rpr)
    for c in rpr.findall(Q + 'color'):
        rpr.remove(c)
    etree.SubElement(rpr, Q + 'color').set(Q + 'val', color)


def fill(entries, values, color_map=None, white=False):
    """Pone los valores de ejemplo. color_map: color único por párrafo corrido o por dato (medición).
    white: lo que el panel va a escribir queda en blanco en la hoja de fondo."""
    out = dict(entries)
    root = etree.fromstring(entries['word/document.xml'])
    for idx, p in target_paragraphs(root):
        flow = is_flow(p)
        for rn, r in enumerate(p.iter(Q + 'r')):
            t = r.find(Q + 't')
            field = t is not None and t.text and '{{' in t.text
            if color_map is not None or white:
                if flow or field:
                    key = (idx,) if flow else (idx, rn)
                    color = 'FFFFFF' if white else color_map.setdefault(key, '%06X' % (0x010000 * (len(color_map) + 1) + 0x0101))
                    set_color(r, color)
            if field:
                t.text = re.sub(r'\{\{(\w+)\}\}', lambda m: values.get(m.group(1), ''), t.text)
    out['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    return out


def run_info(r):
    rpr = r.find(Q + 'rPr')
    on = lambda tag: rpr is not None and rpr.find(Q + tag) is not None and rpr.find(Q + tag).get(Q + 'val') not in ('0', 'false', 'none')
    return {'b': on('b'), 'u': on('u'), 'caps': on('caps')}


def specs(entries):
    """Por cada párrafo corrido: sus corridas. Por cada dato suelto: su marca y formato."""
    root = etree.fromstring(entries['word/document.xml'])
    out = {}
    for idx, p in target_paragraphs(root):
        if is_flow(p):
            runs = []
            for r in p.iter(Q + 'r'):
                t = r.find(Q + 't')
                if t is not None and t.text:
                    runs.append({'t': t.text, **run_info(r)})
            out[(idx,)] = {'flow': True, 'runs': runs}
        else:
            for rn, r in enumerate(p.iter(Q + 'r')):
                t = r.find(Q + 't')
                if t is not None and t.text and '{{' in t.text:
                    jc = p.find(Q + 'pPr/' + Q + 'jc')
                    out[(idx, rn)] = {'flow': False, 'jc': jc.get(Q + 'val') if jc is not None else 'left', 'runs': [{'t': t.text.strip(' '), **run_info(r)}]}
    return out


def to_pdf(entries, name, work):
    src = work / f'{name}.docx'
    with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in entries.items():
            z.writestr(k, v)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', str(work), str(src)], check=True, capture_output=True, timeout=180)
    return src.with_suffix('.pdf')


def measure(pdf, color_map):
    inv = {v: k for k, v in color_map.items()}
    found = {}
    with pdfplumber.open(pdf) as doc:
        for pn, page in enumerate(doc.pages):
            vlines = [(e['x0'], e['top'], e['bottom']) for e in page.edges if abs(e['x0'] - e['x1']) < .6]
            groups, others = {}, []
            for c in page.chars:
                col = c.get('non_stroking_color')
                hexcol = '%02X%02X%02X' % tuple(round(v * 255) for v in col) if col and len(col) == 3 else None
                if hexcol in inv and c['text'].strip():
                    groups.setdefault(inv[hexcol], []).append(c)
                elif c['text'].strip():
                    others.append(c)
            for key, chars in groups.items():
                if key in found:
                    continue
                tops = []
                for c in sorted(chars, key=lambda c: c['top']):
                    if not any(abs(c['top'] - t) < 1.5 for t in tops):
                        tops.append(c['top'])
                lines = [{'top': t, 'x0': min(c['x0'] for c in chars if abs(c['top'] - t) < 1.5), 'x1': max(c['x1'] for c in chars if abs(c['top'] - t) < 1.5)} for t in tops]
                sizes = [round(c['size'], 1) for c in chars]
                size = max(set(sizes), key=sizes.count)
                first = lines[0]
                cy = first['top'] + size / 2
                after = [c['x0'] for c in others if abs(c['top'] - first['top']) < 2 and c['x0'] > first['x1']]
                rights = [x for x, t0, t1 in vlines if x > first['x1'] - .5 and t0 - 1 <= cy <= t1 + 1]
                font = chars[0]['fontname'].split('+')[-1]
                found[key] = {'page': pn, 'top': round(first['top'], 2), 'x0': round(first['x0'], 2), 'x1': round(first['x1'], 2),
                              'right': round(max(l['x1'] for l in lines), 2), 'left': round(min(l['x0'] for l in lines), 2),
                              'limit': round(min(([min(after) - 5] if after else []) + ([min(rights) - 3] if rights else []) + [page.width - 50]), 2),
                              'lineGap': round(lines[1]['top'] - lines[0]['top'], 2) if len(lines) > 1 else round(size * 1.15, 2),
                              'size': size, 'font': 'carlito' if 'Carlito' in font else 'helvetica' if re.search(r'Sans|Arial|Helvetica', font) else 'times'}
        npages = len(doc.pages)
    return found, npages


def pack_entries(entries):
    """Partes con marcas {{…}}: sin comprimir (el panel las llena). El resto: comprimidas como en el archivo original."""
    import zlib
    out = []
    for k, v in entries.items():
        if (k.endswith('.xml') or k.endswith('.vml')) and b'{{' in v:
            out.append([k, base64.b64encode(v).decode()])
        else:
            co = zlib.compressobj(9, zlib.DEFLATED, -15)
            packed = co.compress(v) + co.flush()
            out.append([k, base64.b64encode(packed).decode(), zlib.crc32(v) & 0xffffffff, len(v)])
    return out


def flow_layout(entries):
    """Documento de solo texto (compraventa): el panel lo compone completo, con saltos de hoja.
    Por cada párrafo: corridas (texto con marcas, negrita, tamaño), alineación, sangrías, interlineado y espacio después."""
    root = etree.fromstring(entries['word/document.xml'])
    body = root.find(Q + 'body')
    tw = lambda v: round(int(v) / 20, 2)
    sect = body.find(Q + 'sectPr')
    mar = sect.find(Q + 'pgMar')
    size = sect.find(Q + 'pgSz')
    paras = []
    for p in body.findall(Q + 'p'):
        ppr = p.find(Q + 'pPr')
        get = lambda path, attr, default=None: (ppr.find(path).get(Q + attr) if ppr is not None and ppr.find(path) is not None and ppr.find(path).get(Q + attr) is not None else default)
        line = get(Q + 'spacing', 'line', '259')
        rule = get(Q + 'spacing', 'lineRule', 'auto')
        runs = []
        for r in p.iter(Q + 'r'):
            info = run_info(r)
            rpr = r.find(Q + 'rPr')
            sz = rpr.find(Q + 'sz') if rpr is not None else None
            size_pt = int(sz.get(Q + 'val')) / 2 if sz is not None else 11
            for child in r:
                if child.tag == Q + 't' and child.text:
                    runs.append({'t': child.text, 'b': info['b'], 'size': size_pt})
                elif child.tag == Q + 'tab':
                    runs.append({'t': '\t', 'b': info['b'], 'size': size_pt})
        paras.append({'align': {'both': 'justify', 'center': 'center', 'right': 'right'}.get(get(Q + 'jc', 'val', 'left'), 'left'),
                      'indLeft': tw(get(Q + 'ind', 'left', '0')), 'firstLine': tw(get(Q + 'ind', 'firstLine', '0')),
                      'line': tw(line) if rule in ('exact', 'atLeast') else round(int(line) / 240, 3), 'lineRule': rule,
                      'after': tw(get(Q + 'spacing', 'after', '0')), 'runs': runs})
    return {'flow': True, 'pages': 1, 'size': [tw(size.get(Q + 'w')), tw(size.get(Q + 'h'))],
            'margins': {'top': tw(mar.get(Q + 'top')), 'bottom': tw(mar.get(Q + 'bottom')), 'left': tw(mar.get(Q + 'left')), 'right': tw(mar.get(Q + 'right'))},
            'font': 'gothic', 'images': [], 'items': [], 'paragraphs': paras}


def main():
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp())
    summary = {}
    for kind in ('carta', 'matricula', 'exoneracion'):
        marked = prepare(src / f'{kind}.docx', kind)
        sp = specs(marked)
        colors = {}
        probe = to_pdf(fill(marked, SAMPLE, color_map=colors), f'{kind}-probe', work)
        found, npages = measure(probe, colors)
        back = to_pdf(fill(marked, SAMPLE, white=True), f'{kind}-fondo', work)
        for old in OUT.glob(f'{kind}-fondo-*.jpg'):
            old.unlink()
        subprocess.run(['pdftoppm', '-r', '200', '-jpeg', '-jpegopt', 'quality=86', str(back), str(OUT / f'{kind}-fondo')], check=True)
        images = sorted(p.name for p in OUT.glob(f'{kind}-fondo-*.jpg'))
        items, missing = [], []
        for key, spec in sp.items():
            f = found.get(key)
            if not f:
                missing.append((key, spec['runs'][0]['t'][:40]))
                continue
            base = {'page': f['page'], 'top': f['top'], 'size': f['size'], 'font': f['font'], 'runs': spec['runs']}
            if spec['flow']:
                items.append({**base, 'align': 'justify', 'left': f['left'], 'right': f['right'], 'lineGap': f['lineGap']})
            elif spec['jc'] == 'right':
                items.append({**base, 'align': 'right', 'left': round(f['x1'] - 260, 2), 'right': f['x1'], 'lineGap': f['lineGap']})
            else:
                items.append({**base, 'align': 'left', 'left': f['x0'], 'right': f['limit'], 'lineGap': f['lineGap']})
        for it in items:
            if it['align'] == 'justify':
                it['right'] = max(o['right'] for o in items if o['align'] == 'justify' and o['page'] == it['page'])
        # Los cuadros de texto vienen repetidos (versión nueva y de respaldo de Word): basta con el que se dibuja.
        missing = [m for m in missing if not any(it['runs'][0]['t'].strip() == m[1].strip() for it in items)]
        for m in missing:
            print('AVISO: no se ubicó', kind, m)
        layout = {'pages': npages, 'size': [612, 792], 'images': images, 'items': items}
        (OUT / f'{kind}-layout.json').write_text(json.dumps(layout, ensure_ascii=False, indent=1))
        (OUT / f'{kind}.json').write_text(json.dumps({'type': 'docx', 'entries': pack_entries(marked)}))
        summary[kind] = {'pages': npages, 'items': len(items)}
    # Póliza tipo placa (PowerPoint): la placa sin textos de fondo; el panel escribe la póliza de SAP y los textos.
    if (src / 'placa.pptx').exists():
        with zipfile.ZipFile(src / 'placa.pptx') as z:
            items = {i.filename: z.read(i.filename) for i in z.infolist()}
        items['ppt/slides/slide1.xml'] = re.sub(rb'<a:t>[^<]*</a:t>', b'<a:t></a:t>', items['ppt/slides/slide1.xml'])
        blank = work / 'placa.pptx'
        with zipfile.ZipFile(blank, 'w', zipfile.ZIP_DEFLATED) as z:
            for k, v in items.items():
                z.writestr(k, v)
        subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', str(work), str(blank)], check=True, capture_output=True, timeout=180)
        subprocess.run(['pdftoppm', '-r', '150', '-jpeg', '-jpegopt', 'quality=88', '-singlefile', str(work / 'placa.pdf'), str(OUT / 'placa-fondo-1')], check=True)
        (OUT / 'placa-layout.json').write_text(json.dumps({'pages': 1, 'size': [960, 540], 'images': ['placa-fondo-1.jpg'], 'items': [], 'placa': True}))
        summary['placa'] = {'pages': 1}
    # Compraventa de contado: solo texto; el panel la compone entera
    if (src / 'compraventa.docx').exists():
        marked = prepare(src / 'compraventa.docx', 'compraventa')
        (OUT / 'compraventa.json').write_text(json.dumps({'type': 'docx', 'entries': pack_entries(marked)}))
        lay = flow_layout(marked)
        (OUT / 'compraventa-layout.json').write_text(json.dumps(lay, ensure_ascii=False, indent=1))
        summary['compraventa'] = {'paragraphs': len(lay['paragraphs'])}
        # Letra parecida a Century Gothic (Didact Gothic, licencia OFL), recortada a letras latinas
        from fontTools import subset
        opts = subset.Options(); opts.name_IDs = ['*']; opts.notdef_outline = True
        font = subset.load_font(str(ROOT / 'src/vendor/fonts/DidactGothic-Regular.ttf'), opts)
        sub = subset.Subsetter(opts); sub.populate(unicodes=list(range(0x20, 0x7f)) + list(range(0xa0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026]); sub.subset(font)
        tmp = work / 'gothic.ttf'; font.save(str(tmp))
        (OUT / 'gothic.json').write_text(json.dumps({'gothic': base64.b64encode(tmp.read_bytes()).decode()}))
    shutil.rmtree(work)
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
