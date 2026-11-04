import re

src = open('firestore.rules.candidata').read()

# La rama fusionada actual, localizada por su comentario.
i = src.index('      // Integración de actividad P1 (2026-11-03): OTORGAR,')
j = src.index('      // The trainer deletes user docs (reject flow).')
rama = src[i:j]

PRE = """      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['activityConsents', 'consentSeq', 'consentReceiptId'])
        && request.resource.data.consentSeq == resource.data.get('consentSeq', 0) + 1
        && request.resource.data.consentReceiptId == uid + '_' + string(request.resource.data.consentSeq)
"""

def variante(nombre, cuerpo):
    out = src[:i] + cuerpo + src[j:]
    open('firestore.rules.' + nombre, 'w').write(out)

# P0 — solo el preámbulo (sin forma ni recibo).
variante('sondaP0', PRE + '        && true;\n\n')
# P1 — preámbulo + forma sin recibo: actActShapeOk con el bloque
# del recibo neutralizado.
RECIBO = '''        && existsAfter(receiptPath(rid))
        && r.uid == request.auth.uid
        && r.type == 'activity-' + t + '-' + action
        && r.version == subA.get('version', '')
        && r.at == request.time;'''
esqueleto = src[:i] + PRE + '        && actActShapeOk(resource.data, request.resource.data);\n\n' + src[j:]
p1 = esqueleto.replace(RECIBO, '        && true;')
assert p1 != esqueleto
open('firestore.rules.sondaP1', 'w').write(p1)
# P2 — como P1 pero SOLO existsAfter como chequeo de recibo.
p2 = esqueleto.replace(RECIBO, '        && existsAfter(receiptPath(rid));')
assert p2 != esqueleto
open('firestore.rules.sondaP2', 'w').write(p2)
print('sondas escritas')
