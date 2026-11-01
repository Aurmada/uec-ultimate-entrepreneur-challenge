"""Each sculpted fighter's own design (lab/blender/fighter3d.py): one module a
fighter, named by their id in data/fighters.js, holding what is theirs alone.

    head(fx)             the head's forms, added to fx.F after the neck
    head_definition(fx)  the face's carved lines, before the body's
    eyewear(fx)          optional: a mesh named '<slot>:<option>' for the game
                         to wear by their look (fx.shades makes a pair)

`fx` is the pipeline module, for its field and tools (E, C, V, sc, LINE).
Everything else, the body, clothes, rig and export, is the pipeline's, scaled
from their game data.
"""
