"""Genera datos de prueba "peor caso" para revisar el panel (break-ui).

Solo para pruebas: no forma parte de la página. Produce respaldos con la misma
forma que los datos reales, para cargarlos en un navegador de prueba:
  worst  - nombres largos, símbolos, montos grandes, 18 ventas en el mes, créditos extremos
  empty  - sin clientes ni ventas
  one    - un cliente y una venta (singulares)
  huge   - 1,000 clientes en el mes actual
Uso: python3 qa/worst-case-data.py <carpeta-salida>
"""
import json, sys, copy, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = json.loads((ROOT / 'data/initial-backup.json').read_text())
MONTH = sys.argv[2] if len(sys.argv) > 2 else '2026-11'
out = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
out.mkdir(parents=True, exist_ok=True)

STOCK = [s['id'] for s in base['stock']]


def blank(db):
    db = copy.deepcopy(db)
    for k in ['clients', 'quotes', 'requests', 'sales', 'campaigns', 'postSales']:
        db[k] = []
    db['creditForms'] = []
    return db


def client(name, phone, stage, day, price=None, stock=0, pending=False, notes='', follow=''):
    return {'id': str(uuid.uuid4()), 'name': name, 'namePending': pending, 'phone': phone, 'stockId': STOCK[stock % len(STOCK)],
            'stage': stage, 'source': 'WhatsApp', 'paymentMode': 'Crédito', 'nextFollow': follow, 'notes': notes, 'archived': False,
            'createdAt': f'{MONTH}-{day:02d}T15:00:00Z', 'history': [], 'recordDate': f'{MONTH}-{day:02d}', 'price': price,
            'documentation': '', 'plates': '', 'saleId': ''}


def sell(db, c, amount):
    s = {'id': str(uuid.uuid4()), 'clientId': c['id'], 'stockId': c['stockId'], 'amount': amount, 'commission': 0,
         'date': c['recordDate'], 'source': 'WhatsApp', 'campaignId': '', 'notes': '', 'status': 'Vendido',
         'documentation': 'Pendiente', 'plates': 'En proceso', 'managedByClient': True}
    c['saleId'] = s['id']; c['price'] = amount; c['documentation'] = 'Pendiente'; c['plates'] = 'En proceso'
    db['sales'].append(s)


def credit(name, dui, **kw):
    f = {'id': str(uuid.uuid4()), 'clientId': '', 'name': name, 'dui': dui, 'phone': '', 'model': '', 'year': '', 'price': None, 'down': None,
         'months': 18, 'vendor': 'Daniel Campos', 'agency': 'TVS ROOSEVELT SM', 'agencyPhone': '60824466', 'birth': '', 'sex': '',
         'nationality': 'Salvadoreño', 'address': '', 'addressRef': '', 'company': '', 'position': '', 'startDate': '', 'income': None,
         'otherIncome': None, 'workAddress': '', 'workRef': '', 'workPhone': '', 'detail': '',
         'famRefs': [{'name': '', 'phone': '', 'relation': 'FAMILIAR'} for _ in range(2)],
         'friendRefs': [{'name': '', 'phone': '', 'relation': 'CONOCIDA'} for _ in range(2)],
         'createdAt': f'{MONTH}-18T15:00:00Z', 'updatedAt': f'{MONTH}-18T15:00:00Z'}
    f.update(kw)
    return f


# ---------- Peor caso realista ----------
worst = blank(base)
long_name = 'MARÍA DE LOS ÁNGELES HERNÁNDEZ GUTIÉRREZ VDA. DE CASTELLANOS'
company = 'Transportes y Distribuciones Hermanos Pérez & Asociados, S.A. de C.V.'
notes = ('Cliente pidió que lo llamen después de las 5 pm porque trabaja en turno. ' * 12).strip()
people = [
    client(long_name, '7000 0000', 'Vendido', 3, stock=4),
    client('Ana', '', 'Nuevo', 4, follow=f'{MONTH}-01'),
    client('Interesado · +503 7123 4567', '+50371234567', 'Nuevo', 5, pending=True),
    client('KEVIN ALEXANDER MÉNDEZ ÑÚÑEZ', '+1 (213) 555-0199', 'Credito ingresado', 6, price=2149, stock=2),
    client(company, '2660 0000', 'Aprobado', 7, price=5999.99, stock=5, notes=notes),
    client('JOSÉ ÜLISES PEÑA O\'CONNOR', '7777-7777', 'No continuó', 8, stock=1),
]
for c in people:
    worst['clients'].append(c)
sell(worst, people[0], 5999.99)
# 17 ventas más: 18 en el mes, por encima de la tabla de comisiones (0 a 15)
for i in range(17):
    c = client(f'CLIENTE VENTA {i + 1:02d} RODRÍGUEZ', f'7{i:03d} {i:04d}', 'Vendido', 9 + i % 9, stock=i)
    worst['clients'].append(c)
    sell(worst, c, [1279, 2149, 3199, 4999.99][i % 4])
worst['requests'].append({'id': str(uuid.uuid4()), 'clientId': people[3]['id'], 'lender': 'Crediopciones', 'status': 'Pendiente',
                          'date': f'{MONTH}-10', 'expires': f'{MONTH}-01', 'notes': notes[:600],
                          'docs': [{'label': l, 'done': i % 3 == 0} for i, l in enumerate(['DUI ambos lados', 'NIT', 'Constancia de sueldo con 30 días de vigencia', 'Recibo de luz', 'Recibo de agua', 'Boletas de pago (últimas 3)', 'Croquis de vivienda', 'Referencias verificadas'])]})
addr = 'Colonia Ciudad Pacífica, Pasaje Los Almendros, Polígono B, Casa #47, frente a la cancha de la colonia, contiguo a la tienda Don Chepe, San Miguel, San Miguel'
worst['creditForms'] = [
    credit(long_name, '01234567-8'),
    credit('KEVIN ALEXANDER MÉNDEZ ÑÚÑEZ', '05846874-5', phone='+1 (213) 555-0199', model='APACHE RTR 200 4V FI ABS EDICIÓN ESPECIAL', year='2027',
           price=99999.99, down=0, months=48, birth='1966-02-28', sex='M', nationality='Salvadoreño', address=addr, addressRef='Portón negro con verja blanca, a la par de la iglesia evangélica',
           company=company, position='Supervisor de bodega y distribución regional', startDate='2025-11-01', income=12500.5, otherIncome=1250.75,
           workAddress='Carretera Panamericana km 138, Parque Industrial Oriente, bodega 14, San Miguel', workRef='Entrada principal del parque industrial', workPhone='2660 0000 ext. 104',
           detail=('Localizar de 5 a 7 pm. Verificación de campo coordinada. ' * 20).strip(),
           famRefs=[{'name': 'MARÍA DE LOS ÁNGELES HERNÁNDEZ GUTIÉRREZ DE MÉNDEZ', 'phone': '+1 (213) 555-0123', 'relation': 'FAMILIAR'},
                    {'name': 'Jo', 'phone': '7000 0000', 'relation': 'FAMILIAR'}],
           friendRefs=[{'name': 'BARTOLOMÉ FRANCISCO ALVARENGA ZELAYA', 'phone': '7123 4567', 'relation': 'CONOCIDA'},
                       {'name': 'Ana', 'phone': '7999 9999', 'relation': 'CONOCIDA'}]),
    credit('ANA', '00000001-1', phone='7000 0000', model='SPORT 100', year='2027', price=1279, down=1279, months=12),
]

# ---------- Vacío, uno, enorme ----------
empty = blank(base)
one = blank(base)
c1 = client('Ana', '7000 0000', 'Vendido', 10)
one['clients'].append(c1); sell(one, c1, 1279)
one['creditForms'] = [credit('Ana', '01234567-8')]
huge = blank(base)
for i in range(1000):
    huge['clients'].append(client(f'CLIENTE {i + 1:04d} HERNÁNDEZ', f'7{i % 1000:03d} {i:04d}', ['Nuevo', 'En seguimiento', 'Documentos', 'Aprobado', 'No continuó'][i % 5], 1 + i % 28, stock=i))

for name, db in {'worst': worst, 'empty': empty, 'one': one, 'huge': huge}.items():
    (out / f'{name}.json').write_text(json.dumps(db, ensure_ascii=False))
print('ok', {k: len(v['clients']) for k, v in {'worst': worst, 'empty': empty, 'one': one, 'huge': huge}.items()})
