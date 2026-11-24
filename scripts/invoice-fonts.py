"""Static Regular and Bold faces for the invoice PDF, with a Naira sign.

Schibsted Grotesk (OFL) has no U+20A6 and PDFKit can't embed a variable
weight, so this makes two small renamed instances: N with two bars.
Run: python scripts/invoice-fonts.py  (needs fontTools)
"""

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = "packages/ui/fonts/"
for name, weight, bar in (("regular", 400, 62), ("bold", 700, 96)):
    font = instancer.instantiateVariableFont(
        TTFont(ROOT + "schibsted-grotesk.ttf"), {"wght": weight}
    )
    glyphs = font.getGlyphSet()
    source = font.getBestCmap()[ord("N")]
    width, bearing = font["hmtx"][source]
    scale = font["head"].unitsPerEm / 1000
    recording = DecomposingRecordingPen(glyphs)
    glyphs[source].draw(recording)
    pen = TTGlyphPen(None)
    recording.replay(pen)
    cap = font["OS/2"].sCapHeight
    thick = bar * scale * 0.7
    for centre in (cap * 0.60, cap * 0.38):
        low, high = centre - thick / 2, centre + thick / 2
        left, right = 10 * scale, width - 10 * scale
        points = [(left, low), (left, high), (right, high), (right, low)]
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    glyph = pen.glyph()
    font["glyf"]["uni20A6"] = glyph
    font["hmtx"]["uni20A6"] = (width, int(10 * scale))
    font.setGlyphOrder(
        font.getGlyphOrder()
        if "uni20A6" in font.getGlyphOrder()
        else font.getGlyphOrder() + ["uni20A6"]
    )
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[0x20A6] = "uni20A6"
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16):
            record.string = f"GiddyDealInvoice-{name.title()}"
    for table in ("GSUB", "GPOS", "GDEF", "STAT"):
        if table in font:
            del font[table]
    font.save(f"{ROOT}invoice-{name}.ttf")
    print(name, "saved")
