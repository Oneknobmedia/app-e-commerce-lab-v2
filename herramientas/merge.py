import re, sys
RX = [('css', r'<style id="css">(.*?)</style>'), ('edcss', r'<style id="edcss">(.*?)</style>'), ('edshell', r'<template id="edshell">(.*?)</template>'), ('shell', r'<template id="shell">(.*?)</template>'), ('app', r'<script id="app"[^>]*>(.*?)</script>\s*(?=<script>|</body>)')]
def spans(p):
    d = {}
    for n, rx in RX:
        m = re.search(rx, p, re.S); assert m, n; d[n] = (m.start(1), m.end(1))
    return d
rd = lambda f: open(f, encoding='utf8', newline='').read().replace('\r\n', '\n')
pub, loc, old, out_f = rd(sys.argv[1]), rd(sys.argv[2]), rd(sys.argv[3]), sys.argv[4]
P, L, O = spans(pub), spans(loc), spans(old)
# el publicado debe tener los mismos bloques del editor que el backup anterior (nada más cambió)
for n in P:
    print(n, 'publicado==backup' if pub[P[n][0]:P[n][1]] == old[O[n][0]:O[n][1]] else 'DISTINTO')
out = pub
for n in sorted(P, key=lambda n: -P[n][0]):
    a, b = P[n]; la, lb = L[n]; out = out[:a] + loc[la:lb] + out[b:]
open(out_f, 'w', encoding='utf8', newline='').write(out)
print(len(pub), len(out))
