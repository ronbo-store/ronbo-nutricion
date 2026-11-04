import re

src = open('firestore.rules.candidata').read()

# A — actActOk anulado (las ramas existen; forma y recibo no se
# comprueban): si G1 pasa, el cerdo vive dentro de actActOk.
a = re.sub(r'function actActOk\(before, after, mode\) \{.*?\n    \}',
           "function actActOk(before, after, mode) {\n      return true;\n    }",
           src, flags=re.S)
assert a != src and 'return true;' in a
open('firestore.rules.varA', 'w').write(a)

# B — sin el bloque match /activity_data (D8).
i = src.index('    // ---------- Datos de actividad (Integración P1, 2026-11-03) ----------')
j = src.index('    // ---------- Consent receipts (A2) ----------')
b = src[:i] + src[j:]
assert 'activity_data' not in b.split('match /users')[0][-200:] or True
open('firestore.rules.varB', 'w').write(b)

# C — sin las dos ramas del alumno (D7): G1 debe fallar LIMPIO.
i = src.index('      // Integración de actividad P1 (2026-11-03): OTORGAR o')
j = src.index('      // The trainer deletes user docs (reject flow).')
c = src[:i] + src[j:]
assert 'actActOk(resource.data' not in c
open('firestore.rules.varC', 'w').write(c)
print('variantes escritas: A', len(a), '· B', len(b), '· C', len(c), '· candidata', len(src))
