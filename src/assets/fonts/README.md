# Portfolio font

Asap is the public portfolio font. The checked-in WOFF2 is derived
from the Google Fonts distribution of Omnibus-Type's Asap variable font:
https://github.com/google/fonts/tree/main/ofl/asap

Upstream file: `Asap[wdth,wght].ttf`
Upstream SHA-256: `7bf29bcab72f7d00de600e964a3fc206620050d8448ddd976822378d0fe18028`

The width axis is instantiated at 95 to match the approved typography preview;
the full weight axis (100–900) and character set are retained. The file was compressed to WOFF2 with fontTools 4.68.0 and Brotli. Its
license is in `Asap-OFL.txt`. Production builds use the checked-in font directly.

To reproduce from the upstream file with fontTools and Brotli installed:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont("Asap[wdth,wght].ttf")
instantiateVariableFont(font, {"wdth": 95}, inplace=True)
font.flavor = "woff2"
font.save("asap-variable.woff2")
```

The public portfolio uses only Asap.
