# nikita-andreiev.com

Nikita Andreiev's portfolio. A 3D chess board plays Morphy's Opera Game (Paris, 1858) as you scroll, then the projects, experience and contact. Live at https://nikita-andreiev.com (also reachable as https://barabosik.github.io, which redirects).

## Stack

- Vite, three.js, GSAP + Lenis for scroll
- All sound is generated in code with Web Audio (`src/sound.js`): no audio files
- Fonts and images are self-hosted in `public/`

## Run it

```
npm install
npm run dev       # http://localhost:5173
npm run build     # into dist/
npm run preview   # serve dist/
npm run deploy    # build, then publish dist/ to GitHub Pages
```

## Branches

- `source`: the code. Work here.
- `main`: the built site only, force-pushed by `npm run deploy`. Never edit it by hand.

## Layout

```
index.html         page markup
src/
  main.js          page wiring: scroll, cursor, sound toggle, secrets
  board.js         the 3D board, camera and the game on the scroll
  opera.js         the Opera Game moves and annotations
  glb.js           tiny reader for the meshopt-compressed piece models
  sound.js         music and sound effects (Web Audio)
  fx.js            click particles
  style.css
  assets/pieces.glb  chess pieces made in Blender (see tools/pieces)
public/            static files copied as-is: fonts, images, og.jpg, robots, sitemap, 404
tools/
  deploy.mjs       publishes dist/ to the main branch
  pieces/          Blender script that builds src/assets/pieces.glb
```

Local only, not in git: `.work/` (design references, LinkedIn media, sound tests, vendored skill repos, the old single-file version) and the agent folders `.claude/` and `.taste-skill/`.

## Chess pieces

`tools/pieces/build_pieces.py` runs in headless Blender, turns the pieces, bakes lighting into vertex colours, and `gltf-transform meshopt` compresses the result into `src/assets/pieces.glb`. The knight is the CC0 model from Poly Haven's chess set.
