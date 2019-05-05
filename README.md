# Circle of Fifths animation

This directory contains a simple python script to derive the major musical scales (C major, F# major, etc.) by starting on one key, adding a sharp to the fourth note, and shifting the starting note.  It shows an animation when run as a terminal script.

## Usage

### Derive all scales and print results:

```bash
python circle5.py
```

Output:
```
Circle of fifths scales:
   Gb major:  Gb   Ab   Bb   Cb   Db   Eb   F
   Db major:  Db   Eb   F    Gb   Ab   Bb   C
   Ab major:  Ab   Bb   C    Db   Eb   F    G
   Eb major:  Eb   F    G    Ab   Bb   C    D
   Bb major:  Bb   C    D    Eb   F    G    A
   F  major:  F    G    A    Bb   C    D    E
*  C  major:  C    D    E    F    G    A    B
   G  major:  G    A    B    C    D    E    F#
   D  major:  D    E    F#   G    A    B    C#
   A  major:  A    B    C#   D    E    F#   G#
   E  major:  E    F#   G#   A    B    C#   D#
   B  major:  B    C#   D#   E    F#   G#   A#
   F# major:  F#   G#   A#   B    C#   D#   E#
   C# major:  C#   D#   E#   F#   G#   A#   B#
   G# major:  G#   A#   B#   C#   D#   E#   F##
   D# major:  D#   E#   F##  G#   A#   B#   C##
   A# major:  A#   B#   C##  D#   E#   F##  G##
   E# major:  E#   F##  G##  A#   B#   C##  D##
   B# major:  B#   C##  D##  E#   F##  G##  A##

Sorted scales:
   Ab major:  Ab   Bb   C    Db   Eb   F    G
   A  major:  A    B    C#   D    E    F#   G#
   A# major:  A#   B#   C##  D#   E#   F##  G##
   Bb major:  Bb   C    D    Eb   F    G    A
   B  major:  B    C#   D#   E    F#   G#   A#
   B# major:  B#   C##  D##  E#   F##  G##  A##
*  C  major:  C    D    E    F    G    A    B
   C# major:  C#   D#   E#   F#   G#   A#   B#
   Db major:  Db   Eb   F    Gb   Ab   Bb   C
   D  major:  D    E    F#   G    A    B    C#
   D# major:  D#   E#   F##  G#   A#   B#   C##
   Eb major:  Eb   F    G    Ab   Bb   C    D
   E  major:  E    F#   G#   A    B    C#   D#
   E# major:  E#   F##  G##  A#   B#   C##  D##
   F  major:  F    G    A    Bb   C    D    E
   F# major:  F#   G#   A#   B    C#   D#   E#
   Gb major:  Gb   Ab   Bb   Cb   Db   Eb   F
   G  major:  G    A    B    C    D    E    F#
   G# major:  G#   A#   B#   C#   D#   E#   F##
```

### Derive all scales and display animation:
```bash
python circle5_anim.py
```

Note: if the terminal output doesn't show up properly (e.g. garbled characters appear), install `colorama` inside of a python virtualenv before running the script:
```bash
virtualenv venv
venv/bin/activate           # (Windows)
source venv/bin/activate    # (Non-windows)
pip install -r requirements.txt
python circle5_anim.py
```
