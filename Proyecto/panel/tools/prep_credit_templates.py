"""Prepara los documentos originales de Crediopciones para el panel.

Uso: python3 tools/prep_credit_templates.py <carpeta con solicitud.xlsx, plan.xlsx y buro.docx>

Genera en assets/credit/templates/:
- <doc>.json: el archivo original sin los datos de ejemplo, con marcas {{campo}} donde el panel
  escribe los datos del cliente (para descargar el Excel o Word lleno).
- <doc>-fondo.jpg y <doc>-layout.json: una imagen exacta de la hoja en blanco y la posición de cada
  dato (para el PDF directo con el documento original de fondo).
Necesita LibreOffice (soffice), pdftoppm y pdfplumber; solo se corre cuando cambian los documentos.
"""
import base64, json, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from lxml import etree
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/credit/templates'
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
Q = '{%s}' % NS

# Campos de cada hoja: celda -> (campo, tipo). Tipo 't' texto, 'n' número.
SOLICITUD = {
    'E3': ('place', 't'), 'E4': ('name', 't'), 'U4': ('phone', 't'), 'C6': ('dui', 't'), 'K6': ('birth', 't'),
    'V7': ('nationality', 't'), 'A9': ('address', 't'), 'A11': ('addressRef', 't'), 'A14': ('company', 't'),
    'K14': ('position', 't'), 'O14': ('startDate', 't'), 'U14': ('income', 'n'), 'A16': ('workAddress', 't'),
    'O17': ('workPhone', 't'), 'U17': ('otherIncome', 'n'), 'A18': ('workRef', 't'),
    'B21': ('fam0name', 't'), 'K21': ('fam0phone', 't'), 'U21': ('famRel0', 't'),
    'B22': ('fam1name', 't'), 'K22': ('fam1phone', 't'), 'U22': ('famRel1', 't'),
    'B25': ('friend0name', 't'), 'K25': ('friend0phone', 't'), 'U25': ('friendRel0', 't'),
    'B26': ('friend1name', 't'), 'K26': ('friend1phone', 't'), 'U26': ('friendRel1', 't'),
    'A35': ('detail', 't'),
}
PLAN = {
    'D8': ('name', 't'), 'D9': ('phone', 't'), 'D11': ('vendor', 't'), 'D12': ('agency', 't'), 'F12': ('agencyPhone', 't'),
    'D13': ('date', 't'), 'D14': ('model', 't'), 'F14': ('year', 't'), 'D20': ('price', 'n'), 'D21': ('down', 'n'),
    'C25': ('months', 'n'),
}
# Celdas calculadas del cotizador: en el Excel quedan con su fórmula; en el PDF las escribe el panel.
PLAN_CALC = {'D18': 'fee', 'B21': 'primaRate', 'E21': 'cuotaOk', 'D22': 'amount', 'D28': 'q12', 'D29': 'q18', 'D30': 'q24',
             'D31': 'q30', 'D32': 'q36', 'D33': 'q40', 'D34': 'q48'}


def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def set_cell(sheet, ref, kind, token):
    """Pone en la celda una marca de texto en línea o de número, sin tocar su estilo."""
    row_n = int(re.search(r'\d+', ref).group(0))
    data = sheet.find(Q + 'sheetData')
    row = next((r for r in data.findall(Q + 'row') if int(r.get('r')) == row_n), None)
    if row is None:
        row = etree.SubElement(data, Q + 'row', r=str(row_n))
        rows = sorted(data.findall(Q + 'row'), key=lambda r: int(r.get('r')))
        for r in rows:
            data.append(r)
    cell = next((c for c in row.findall(Q + 'c') if c.get('r') == ref), None)
    if cell is None:
        cell = etree.Element(Q + 'c', r=ref)
        after = [c for c in row.findall(Q + 'c') if col_index(c.get('r')) < col_index(ref)]
        if after:
            after[-1].addnext(cell)
        else:
            row.insert(0, cell)
    for child in list(cell):
        cell.remove(child)
    cell.attrib.pop('t', None)
    if kind == 'n':
        etree.SubElement(cell, Q + 'v').text = '{{#%s}}' % token
    else:
        cell.set('t', 'inlineStr')
        t = etree.SubElement(etree.SubElement(cell, Q + 'is'), Q + 't')
        t.text = '{{%s}}' % token
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def sheet_path(entries, name):
    wb = entries['xl/workbook.xml'].decode()
    rid = re.search(r'<sheet name="%s"[^>]*r:id="(rId\d+)"' % re.escape(name), wb).group(1)
    rels = entries['xl/_rels/workbook.xml.rels'].decode()
    target = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, rels) or re.search(r'Target="([^"]+)"[^>]*Id="%s"' % rid, rels)
    return 'xl/' + target.group(1).lstrip('/').removeprefix('xl/')


def read_zip(path):
    with zipfile.ZipFile(path) as z:
        return {i.filename: z.read(i.filename) for i in z.infolist()}


def write_zip(entries, path):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)


def blank_shared_strings(entries, sample_texts):
    """Borra los datos de ejemplo de la tabla de textos sin mover los índices."""
    sst = entries.get('xl/sharedStrings.xml')
    if not sst:
        return
    root = etree.fromstring(sst)
    for si in root.findall(Q + 'si'):
        text = ''.join(si.itertext())
        if text.strip() and any(s in text for s in sample_texts):
            for child in list(si):
                si.remove(child)
            etree.SubElement(si, Q + 't').text = ''
    entries['xl/sharedStrings.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


def full_calc_on_load(entries):
    wb = entries['xl/workbook.xml'].decode()
    wb = re.sub(r'<calcPr([^>]*?)/>', lambda m: '<calcPr%s fullCalcOnLoad="1"/>' % m.group(1).replace(' fullCalcOnLoad="1"', ''), wb, count=1)
    entries['xl/workbook.xml'] = wb.encode()


def prepare_xlsx(src, sheet_name, fields, calc=None, samples=(), extra=None):
    entries = read_zip(src)
    path = sheet_path(entries, sheet_name)
    sheet = etree.fromstring(entries[path])
    for ref, (key, kind) in fields.items():
        set_cell(sheet, ref, kind, key)
    # Fórmulas: se borran los resultados guardados (eran del cliente de ejemplo) y Excel los recalcula al abrir.
    # Las del cotizador visible llevan una marca para que el panel escriba el resultado ya calculado.
    for c in sheet.iter(Q + 'c'):
        if c.find(Q + 'f') is not None and c.get('t') != 'str':
            v = c.find(Q + 'v')
            ref = c.get('r')
            if calc and ref in calc and calc[ref] not in ('cuotaOk',):
                if v is None:
                    v = etree.SubElement(c, Q + 'v')
                v.text = '{{#calc_%s}}' % calc[ref]
            elif v is not None:
                c.remove(v)
    marked = dict(entries)
    marked[path] = etree.tostring(sheet, xml_declaration=True, encoding='UTF-8', standalone=True)
    for other in [k for k in entries if k.startswith('xl/worksheets/sheet') and k != path]:
        marked[other] = re.sub(rb'(<f>[^<]*</f>|<f [^>]*/>|<f [^>]*>[^<]*</f>)<v>[^<]*</v>', rb'\1', entries[other])
    blank_shared_strings(marked, samples)
    full_calc_on_load(marked)
    if extra:
        extra(marked)
    # Versión para la imagen de fondo: también se vacían las celdas calculadas.
    for ref, key in (calc or {}).items():
        set_cell(sheet, ref, 't', key)
    backdrop = dict(marked)
    backdrop[path] = etree.tostring(sheet, xml_declaration=True, encoding='UTF-8', standalone=True)
    return marked, backdrop, path


def solicitud_radios(entries):
    """Botones F / M del sexo: el panel decide cuál queda marcado."""
    c1, c2 = 'xl/ctrlProps/ctrlProp1.xml', 'xl/ctrlProps/ctrlProp2.xml'
    entries[c1] = entries[c1].decode().replace(' noThreeD="1"', '{{!ctrlF}} noThreeD="1"').replace(' checked="Checked"', '').encode()
    entries[c2] = entries[c2].decode().replace(' checked="Checked"', '').replace(' noThreeD="1"', '{{!ctrlM}} noThreeD="1"').encode()
    vml = entries['xl/drawings/vmlDrawing1.vml'].decode()
    vml = vml.replace('<x:Checked>1</x:Checked>', '')
    parts = vml.split('</x:ClientData>')
    assert len(parts) == 3, 'Se esperaban dos botones de opción en la solicitud'
    vml = parts[0] + '{{!vmlF}}</x:ClientData>' + parts[1] + '{{!vmlM}}</x:ClientData>' + parts[2]
    entries['xl/drawings/vmlDrawing1.vml'] = vml.encode()


def prepare_docx(src):
    entries = read_zip(src)
    doc = entries['word/document.xml'].decode()
    # Fecha: SAN MIGUEL, dd/mm/aaaa
    doc, n = re.subn(r'(<w:t xml:space="preserve">SAN MIGUEL, </w:t></w:r>)<w:r[^>]*><w:t>\d+</w:t></w:r><w:r[^>]*><w:t>/\d+</w:t></w:r><w:r[^>]*><w:t>/\d+</w:t></w:r>',
                     r'\1<w:r><w:t>{{date}}</w:t></w:r>', doc)
    assert n == 1, 'No encontré la fecha de la carta'
    runs = re.findall(r'<w:t>([^<]*)</w:t>', doc)
    name = next(t for t in runs if t.isupper() and len(t.split()) >= 2 and 'CREDI' not in t and 'SAN MIGUEL' not in t)
    dui = next(t for t in runs if re.fullmatch(r'\d{8}-\d', t))
    assert doc.count('<w:t>%s</w:t>' % name) == 1 and doc.count('<w:t>%s</w:t>' % dui) == 1
    doc = doc.replace('<w:t>%s</w:t>' % name, '<w:t>{{name}}</w:t>').replace('<w:t>%s</w:t>' % dui, '<w:t>{{dui}}</w:t>')
    marked = dict(entries)
    marked['word/document.xml'] = doc.encode()
    # Fondo: la fecha y el párrafo del cliente se pintan en blanco (ocupan el mismo lugar) y el panel los escribe encima.
    p0 = doc.index('<w:t xml:space="preserve">Yo </w:t>')
    p_start = doc.rfind('<w:p ', 0, p0)
    p_end = doc.index('</w:p>', p0)
    para = doc[p_start:p_end].replace('<w:color w:val="000000"/>', '<w:color w:val="FFFFFF"/>')
    back = doc[:p_start] + para + doc[p_end:]
    back = back.replace('<w:r><w:t xml:space="preserve">SAN MIGUEL, </w:t></w:r><w:r><w:t>{{date}}</w:t></w:r>',
                        '<w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">SAN MIGUEL, </w:t></w:r><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>00/00/0000</w:t></w:r>')
    back = back.replace('{{name}}', 'NOMBRE DE EJEMPLO CON DOS APELLIDOS').replace('{{dui}}', '00000000-0')
    backdrop = dict(entries)
    backdrop['word/document.xml'] = back.encode()
    # Versión de medición: el texto visible para ubicarlo en la página.
    probe = dict(entries)
    probe['word/document.xml'] = doc.replace('{{date}}', '00/00/0000').replace('{{name}}', 'NOMBRE DE EJEMPLO CON DOS APELLIDOS').replace('{{dui}}', '00000000-0').encode()
    return marked, backdrop, probe


def to_pdf(entries, suffix, work):
    src = work / ('doc' + suffix)
    write_zip(entries, src)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', str(work), str(src)], check=True, capture_output=True, timeout=180)
    return src.with_suffix('.pdf')


def first_page_jpg(pdf, out, dpi=200):
    stem = out.with_suffix('')
    subprocess.run(['pdftoppm', '-r', str(dpi), '-f', '1', '-l', '1', '-jpeg', '-jpegopt', 'quality=86', '-singlefile', str(pdf), str(stem)], check=True)


def probe_tokens(entries, path, fields, calc, work):
    """Escribe una marca visible en cada celda y mide dónde queda en la página."""
    sheet = etree.fromstring(entries[path])
    tokens = {}
    for i, (ref, key) in enumerate([(r, k) for r, (k, _) in fields.items()] + list((calc or {}).items())):
        tok = 'ZQ%02d' % i
        tokens[tok] = (ref, key)
        set_cell(sheet, ref, 't', tok)
    probe = dict(entries)
    probe[path] = etree.tostring(sheet, xml_declaration=True, encoding='UTF-8', standalone=True)
    pdf = to_pdf(probe, '.probe.xlsx', work)
    found = {}
    with pdfplumber.open(pdf) as p:
        page = p.pages[0]
        for w in page.extract_words(extra_attrs=['size', 'fontname']):
            tok = w['text'].strip('{}')
            if tok in tokens:
                ref, key = tokens[tok]
                found[key] = {'cell': ref, 'x0': w['x0'], 'x1': w['x1'], 'top': w['top'], 'bottom': w['bottom'], 'size': round(w['size'], 2), 'bold': 'Bold' in w['fontname']}
        lines = [(round(e['x0'], 2), round(e['top'], 2), round(e['x1'], 2), round(e['bottom'], 2)) for e in page.edges]
        size = (page.width, page.height)
    return found, lines, size


def cell_boxes(found, lines, merges):
    """Busca el recuadro de cada celda con las líneas de borde dibujadas alrededor de su marca."""
    hs = [l for l in lines if abs(l[1] - l[3]) < .6]
    vs = [l for l in lines if abs(l[0] - l[2]) < .6]
    for key, f in found.items():
        cx, cy = (f['x0'] + f['x1']) / 2, (f['top'] + f['bottom']) / 2
        left = max([v[0] for v in vs if v[0] <= f['x0'] + .5 and v[1] - .5 <= cy <= v[3] + .5] or [None], key=lambda x: x if x is not None else -1)
        right = min([v[0] for v in vs if v[0] >= f['x1'] - .5 and v[1] - .5 <= cy <= v[3] + .5] or [None], key=lambda x: x if x is not None else 1e9)
        top = max([h[1] for h in hs if h[1] <= f['top'] + .5 and h[0] - .5 <= cx <= h[2] + .5] or [None], key=lambda x: x if x is not None else -1)
        bottom = min([h[1] for h in hs if h[1] >= f['bottom'] - .5 and h[0] - .5 <= cx <= h[2] + .5] or [None], key=lambda x: x if x is not None else 1e9)
        f['box'] = [left, top, right, bottom]


def clean(entries):
    """Quita las marcas para dibujar la hoja en blanco."""
    out = {}
    for k, v in entries.items():
        if k.endswith('.xml') or k.endswith('.vml'):
            v = re.sub(rb'<v>\{\{#\w+\}\}</v>', b'', v)
            v = re.sub(rb'\{\{[!#]?\w+\}\}', b'', v)
        out[k] = v
    return out


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


def main():
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp())
    layouts = {}

    # ---- Solicitud
    import openpyxl
    ws = openpyxl.load_workbook(src / 'solicitud.xlsx')['SOLICITUD']
    samples = [str(ws[r].value).strip() for r, (k, t) in SOLICITUD.items() if ws[r].value is not None and t == 't' and k not in ('famRel0', 'famRel1', 'friendRel0', 'friendRel1')]
    marked, backdrop, path = prepare_xlsx(src / 'solicitud.xlsx', 'SOLICITUD', SOLICITUD, samples=samples, extra=solicitud_radios)
    sol_found, sol_lines, sol_size = probe_tokens(clean(backdrop), path, SOLICITUD, None, work)
    cell_boxes(sol_found, sol_lines, None)
    pdf = to_pdf(clean(backdrop), '.solicitud.xlsx', work)
    first_page_jpg(pdf, OUT / 'solicitud-fondo.jpg')
    layouts['solicitud'] = {'page': sol_size, 'fields': sol_found, 'radios': radio_spots(pdf), 'aligns': {**{r: ws[r].alignment.horizontal for r in SOLICITUD}, **{'v:' + r: ws[r].alignment.vertical for r in SOLICITUD}}}

    # ---- Cotizador (plan Siete Tres)
    wsp = openpyxl.load_workbook(src / 'plan.xlsx')['PLAN ESPECIAL SIETE TRES 47']
    psamples = [str(wsp[r].value).strip() for r, (k, t) in PLAN.items() if t == 't' and isinstance(wsp[r].value, str) and not wsp[r].value.startswith('=') and k not in ('vendor', 'agency')]
    pmarked, pback, ppath = prepare_xlsx(src / 'plan.xlsx', 'PLAN ESPECIAL SIETE TRES 47', PLAN, calc=PLAN_CALC, samples=psamples)
    plan_found, plan_lines, plan_size = probe_tokens(pback, ppath, PLAN, PLAN_CALC, work)
    cell_boxes(plan_found, plan_lines, None)
    pdf = to_pdf(clean(pback), '.cotizador.xlsx', work)
    first_page_jpg(pdf, OUT / 'cotizador-fondo.jpg')
    layouts['cotizador'] = {'page': plan_size, 'fields': plan_found, 'aligns': {**{r: wsp[r].alignment.horizontal for r in PLAN}, **{'v:' + r: wsp[r].alignment.vertical for r in PLAN}}}

    # ---- Buró
    bmarked, bback, bprobe = prepare_docx(src / 'buro.docx')
    pdf = to_pdf(bback, '.buro.docx', work)
    first_page_jpg(pdf, OUT / 'buro-fondo.jpg')
    probe_pdf = to_pdf(bprobe, '.buroprobe.docx', work)
    with pdfplumber.open(probe_pdf) as p:
        page = p.pages[0]
        words = page.extract_words(extra_attrs=['size', 'fontname'], keep_blank_chars=False)
        date = [w for w in words if w['text'] in ('SAN', 'MIGUEL,', '00/00/0000')][:3]
        yo = next(w for w in words if w['text'] == 'Yo')
        persona = next(w for w in words if w['text'].startswith('persona'))
        body = [w for w in words if yo['top'] - 1 <= w['top'] <= persona['bottom'] + 1]
        tops = sorted({round(w['top'], 1) for w in body})
        color = next(c for c in page.chars if c['text'] == 'S' and abs(c['top'] - date[0]['top']) < 1).get('non_stroking_color')
        layouts['buro'] = {'page': (page.width, page.height),
                           'date': {'x0': date[0]['x0'], 'x1': date[-1]['x1'], 'top': date[0]['top'], 'bottom': date[0]['bottom'], 'size': round(date[0]['size'], 2), 'font': date[0]['fontname'], 'color': color},
                           'para': {'left': min(w['x0'] for w in body), 'right': max(w['x1'] for w in body), 'top': yo['top'], 'bottom': yo['bottom'], 'lineGap': (tops[1] - tops[0]) if len(tops) > 1 else 14, 'size': round(yo['size'], 2), 'font': yo['fontname'], 'lines': len(tops)}}

    for name, entries in (('solicitud', marked), ('cotizador', pmarked), ('buro', bmarked)):
        payload = {'type': 'docx' if name == 'buro' else 'xlsx', 'entries': pack_entries(entries)}
        (OUT / f'{name}.json').write_text(json.dumps(payload))
    specs = {'solicitud': solicitud_spec(layouts['solicitud']), 'cotizador': cotizador_spec(layouts['cotizador']), 'buro': buro_spec(layouts['buro'])}
    for name, spec in specs.items():
        (OUT / f'{name}-layout.json').write_text(json.dumps(spec, indent=1))
    write_fonts()
    print(json.dumps({k: {'page': v['page'], 'n': len(v.get('fields', {}))} for k, v in layouts.items()}))
    shutil.rmtree(work)


def field_items(fields, font, aligns, skip=()):
    """Centrado: el ancho es simétrico alrededor del centro de la celda (así no invade la de al lado)."""
    items = []
    for key, f in fields.items():
        if key in skip:
            continue
        left, top, right, bottom = f['box']
        mid = (f['x0'] + f['x1']) / 2
        center = aligns.get(f['cell']) in ('center', 'centerContinuous')
        w = 2 * min(mid - left, right - mid) - 4 if center else right - f['x0'] - 2
        items.append({'key': key, 'align': 'center' if center else 'left', 'x': round(mid if center else f['x0'], 2),
                      'w': round(w, 2), 'top': round(f['top'], 2), 'h': round(max(f['bottom'] - f['top'], bottom - f['top'] - 1.5), 2),
                      'size': f['size'], 'bold': f['bold'], 'font': font})
        if aligns.get('v:' + f['cell']) == 'center':
            # Centrado vertical: si el texto ocupa varias líneas, se reparte arriba y abajo del centro de la celda.
            items[-1].update({'mid': round((f['top'] + f['bottom']) / 2, 2), 'boxH': round(bottom - top - 2, 2)})
    return items


def solicitud_spec(lay):
    f = lay['fields']
    items = field_items(f, 'arial', lay['aligns'], skip=('income', 'otherIncome'))
    for key in ('income', 'otherIncome'):
        top = f[key]['top']
        items.append({'key': key, 'money': True, 'dollarX': 435.9, 'x': 538.9, 'align': 'right', 'w': 95, 'top': round(top, 2), 'h': 7, 'size': 6, 'bold': True, 'font': 'arial'})
    r = lay['radios']
    radios = {k: [round(r[k][0] - 3.7, 2), round((r[k][1] + r[k][3]) / 2, 2)] for k in ('F', 'M')}
    return {'page': lay['page'], 'image': 'solicitud-fondo.jpg', 'items': items, 'radios': radios}


def cotizador_spec(lay):
    f = lay['fields']
    calc = ('fee', 'price', 'primaRate', 'down', 'cuotaOk', 'amount', 'months') + tuple(PLAN_CALC.values())
    items = field_items(f, 'carlito', lay['aligns'], skip=calc)
    n = lambda key, right, top, bold, align='right', x=None: {'key': key, 'align': align, 'x': x if x is not None else right, 'w': 90, 'top': top, 'h': 10, 'size': 9.59, 'bold': bold, 'font': 'carlito'}
    items += [n('fee', 294.6, 284.8, False), n('price', 295.3, 308.7, False), n('primaRate', 165, 321.3, True), n('down', 295.2, 321.3, True),
              n('cuotaOk', 0, 321.3, True, 'center', 378.2), n('amount', 294.6, 333.9, True), n('months', 0, 372.0, True, 'center', 191.45)]
    for key in ('q12', 'q18', 'q24', 'q30', 'q36', 'q40', 'q48'):
        it = n(key, 295.2, round(f[key]['top'], 2), False)
        it['dollarX'] = 219.4
        items.append(it)
    return {'page': lay['page'], 'image': 'cotizador-fondo.jpg', 'items': items}


def buro_spec(lay):
    return {'page': lay['page'], 'image': 'buro-fondo.jpg', 'date': lay['date'], 'para': lay['para']}


def write_fonts():
    """Fuentes con las mismas medidas que Calibri y Cambria (las del Excel y el Word), recortadas a letras latinas."""
    from fontTools import subset
    fonts = {}
    for key, path in (('carlito', 'crosextra/Carlito-Regular.ttf'), ('carlitoBold', 'crosextra/Carlito-Bold.ttf'), ('caladeaBold', 'crosextra/Caladea-Bold.ttf')):
        opts = subset.Options()
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        font = subset.load_font('/usr/share/fonts/truetype/' + path, opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=list(range(0x20, 0x7f)) + list(range(0xa0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac])
        sub.subset(font)
        out = OUT / f'{key}.ttf'
        font.save(str(out))
        fonts[key] = base64.b64encode(out.read_bytes()).decode()
        out.unlink()
    (OUT / 'fonts.json').write_text(json.dumps(fonts))


def radio_spots(pdf):
    """Ubica los botones F y M (círculos) del sexo en la hoja en blanco."""
    with pdfplumber.open(pdf) as p:
        page = p.pages[0]
        words = page.extract_words()
        sexo = next(w for w in words if w['text'] == 'Sexo')
        f = next((w for w in words if w['text'] == 'F' and 0 < w['top'] - sexo['top'] < 20), None)
        m = next((w for w in words if w['text'] == 'M' and 0 < w['top'] - sexo['top'] < 20), None)
        return {'F': f and [f['x0'], f['top'], f['x1'], f['bottom']], 'M': m and [m['x0'], m['top'], m['x1'], m['bottom']], 'sexo': [sexo['x0'], sexo['top'], sexo['x1'], sexo['bottom']]}


if __name__ == '__main__':
    main()
