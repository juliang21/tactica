#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate the per-language marketing homepages from one template.

Run after editing templates/landing.html or any landing.* dictionary string:

    python3 scripts/build-landing.py

Writes /index.html (English) and /<lang>/index.html for the rest, then you
commit the output. Deliberately NOT a build step — the app has none, and this
runs by hand so the generated files stay plain files in git.

Why generated: the five language pages are the same document with different
words. Hand-maintaining them means every footer or meta change is six edits,
and they drift. The translated text is BAKED IN rather than swapped by JS at
runtime, because Google indexes the HTML it is served — a German page that
ships English markup is a German page Google files under English.
"""
import io, os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'templates', 'landing.html')
BASE = 'https://tactica.football'

# Output path per language. English is the site root.
DIRS = {'en': '', 'es': 'es', 'de': 'de', 'fr': 'fr', 'it': 'it', 'tr': 'tr'}
NAMES = {'en':'English','es':'Español','de':'Deutsch','fr':'Français','it':'Italiano','tr':'Türkçe'}
LOCALE = {'en':'en_US','es':'es_ES','de':'de_DE','fr':'fr_FR','it':'it_IT','tr':'tr_TR'}

# Head copy. Not in the app dictionaries because these are search-surface
# strings, not UI — each is written for the terms coaches type in that
# language, not translated word-for-word from the English.
HEAD = {
 'en': ("Táctica · Tactical Board for Football Coaches",
        "Free tactical board for football coaches. Plan formations and animated plays, analyse match screenshots, and build training sessions with a drill library. Export images, GIFs and video."),
 'es': ("Táctica · Pizarra Táctica y Planificador para Entrenadores",
        "Pizarra táctica gratis para entrenadores de fútbol. Diseña formaciones y jugadas animadas, analiza capturas de partidos y crea entrenamientos con tu biblioteca de ejercicios."),
 'de': ("Táctica · Taktiktafel und Trainingsplaner für Fußballtrainer",
        "Kostenlose Taktiktafel für Fußballtrainer. Formationen und animierte Spielzüge planen, Spielszenen analysieren und Trainingseinheiten mit Übungsbibliothek erstellen."),
 'fr': ("Táctica · Tableau Tactique et Planificateur pour Entraîneurs",
        "Tableau tactique gratuit pour entraîneurs de football. Créez des formations et des animations, analysez des captures de match et préparez vos séances d'entraînement."),
 'it': ("Táctica · Lavagna Tattica e Pianificatore per Allenatori",
        "Lavagna tattica gratuita per allenatori di calcio. Progetta formazioni e giocate animate, analizza immagini di partita e crea allenamenti con la tua libreria di esercitazioni."),
 'tr': ("Táctica · Futbol Antrenörleri için Taktik Tahtası",
        "Futbol antrenörleri için ücretsiz taktik tahtası. Dizilişler ve animasyonlu oyunlar tasarla, maç görüntülerini analiz et, antrenman planla."),
}

def url_for(lang):
    d = DIRS[lang]
    return BASE + '/' + (d + '/' if d else '')

def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))

def attr(s):
    return esc(s).replace('"', '&quot;')

# ── dictionaries ─────────────────────────────────────────────────────────────
def load_dicts():
    """Pull the landing.* strings out of the app's own i18n files, so the pages
    never disagree with the product.

    Keys and values appear single- OR double-quoted, and indentation differs
    between dictionaries (es.js uses 4 spaces, the rest 2). Matching one style
    produced an empty dict and a silently English page in a language
    directory — so parse both, and assert afterwards.
    """
    PAIR = re.compile(
        r"""^\s*['"]([^'"]+)['"]\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')""",
        re.M)

    def parse(src):
        d = {}
        for key, dq, sq in PAIR.findall(src):
            raw = dq if dq != '' or sq == '' else sq
            d[key] = (raw.replace('\\"', '"').replace("\\'", "'")
                         .replace('\\n', '\n').replace('\\\\', '\\'))
        return d

    out = {}
    en_src = io.open(os.path.join(ROOT, 'js', 'i18n.js'), encoding='utf-8').read()
    out['en'] = parse(re.search(r'  en: \{(.*?)\n  \},', en_src, re.S).group(1))
    for lang in ('es', 'de', 'fr', 'it', 'tr'):
        out[lang] = parse(io.open(os.path.join(ROOT, 'js', 'i18n', lang + '.js'), encoding='utf-8').read())

    # A dictionary that parses to nothing is the exact failure this guards.
    for lang, d in out.items():
        missing = [k for k in ('landing.headline1', 'landing.headline2', 'landing.sub') if not d.get(k)]
        if missing:
            raise SystemExit('dictionary %s: parsed %d keys, missing %s' % (lang, len(d), missing))
    return out

def hreflang_block(current):
    rows = []
    for lang in DIRS:
        rows.append('<link rel="alternate" hreflang="%s" href="%s">' % (lang, url_for(lang)))
    rows.append('<link rel="alternate" hreflang="x-default" href="%s">' % url_for('en'))
    return '\n'.join(rows)

def switcher(lang):
    """Baked <option>s. The marketing pages carry no i18n JS: each language is
    its own URL, so switching navigates instead of repainting text — a page
    that could display Spanish at /de/ would contradict its own canonical."""
    opts = ''.join(
        '<option value="%s"%s>%s</option>' % (l, ' selected' if l == lang else '', NAMES[l])
        for l in DIRS)
    return ('<select class="lang-select lang-select-quiet" aria-label="Language" '
            'onchange="location.href=this.value===\'en\'?\'/\':\'/\'+this.value+\'/\'">%s</select>' % opts)

def build(lang, tpl, dicts):
    d, en = dicts[lang], dicts['en']
    s = tpl
    title, desc = HEAD[lang]
    app_href = '/app/' if lang == 'en' else '/app/?lang=%s' % lang

    s = s.replace('<html lang="en">', '<html lang="%s">' % lang)
    s = re.sub(r'<title>.*?</title>', '<title>%s</title>' % esc(title), s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description" content="[^"]*">',
               '<meta name="description" content="%s">' % attr(desc), s, count=1)
    s = re.sub(r'<link rel="canonical" href="[^"]*">',
               '<link rel="canonical" href="%s">\n%s' % (url_for(lang), hreflang_block(lang)), s, count=1)
    s = re.sub(r'<meta property="og:title" content="[^"]*">',
               '<meta property="og:title" content="%s">' % attr(title), s, count=1)
    s = re.sub(r'<meta property="og:description" content="[^"]*">',
               '<meta property="og:description" content="%s">' % attr(desc), s, count=1)
    s = re.sub(r'<meta property="og:url" content="[^"]*">',
               '<meta property="og:url" content="%s">' % url_for(lang), s, count=1)
    s = re.sub(r'<meta property="og:locale" content="[^"]*">',
               '<meta property="og:locale" content="%s">' % LOCALE[lang], s, count=1)

    # Bake every translated string into the markup.
    def sub_text(m):
        open_tag, key, inner, close = m.group(1), m.group(2), m.group(3), m.group(4)
        val = d.get(key, en.get(key))
        return open_tag + (val if val is not None else inner) + close
    s = re.sub(r'(<(?:span|a|p|strong|div|h1|h2)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(.*?)(</(?:span|a|p|strong|div|h1|h2)>)',
               sub_text, s, flags=re.S)

    s = s.replace('href="/app/"', 'href="%s"' % app_href)
    s = re.sub(r'<select class="lang-select[^>]*>.*?</select>', switcher(lang), s, flags=re.S)
    s = re.sub(r'\n?<script type="module" src="/js/i18n\.js[^"]*"></script>', '', s)
    return s

def main():
    if not os.path.exists(TEMPLATE):
        sys.exit('missing template: %s' % TEMPLATE)
    tpl = io.open(TEMPLATE, encoding='utf-8').read()
    dicts = load_dicts()
    for lang, sub in DIRS.items():
        out_dir = os.path.join(ROOT, sub) if sub else ROOT
        if sub and not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        path = os.path.join(out_dir, 'index.html')
        html = build(lang, tpl, dicts)
        # Stamp it: index.html looks hand-written, and an edit made here is
        # silently destroyed by the next run.
        html = html.replace('<!DOCTYPE html>',
            '<!DOCTYPE html>\n<!-- GENERATED by scripts/build-landing.py from '
            'templates/landing.html — do not edit this file directly.\n'
            '     Edit the template (or the landing.* strings in js/i18n*) and re-run the script. -->', 1)
        io.open(path, 'w', encoding='utf-8').write(html)
        print('  %-5s -> %-22s %6d bytes' % (lang, (sub + '/' if sub else '') + 'index.html', len(html)))

if __name__ == '__main__':
    main()
