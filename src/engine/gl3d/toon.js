// WebGL2 toon renderer for skinned models. RENDER-ONLY. No library: one
// program, one vertex array per primitive, two passes per draw.
//
//   0. MASK: the body's silhouette, offscreen. The body pass reads it so a rim
//      lands only where the outline meets the background (GL3D.RIM_REACH).
//   1. INK: back faces pushed out along their normals, flat ink colour. Only
//      the sliver that clears the body survives the depth test, which gives the
//      silhouette line and the line between a limb and the torso behind it.
//   2. BODY: front faces, lit in three flat bands with a rim on the lit side.
//      The face primitive also takes the fighter's face texture, projected
//      onto the head in bind space.
//   3. GLASS: see-through materials, lit the same way and blended over the
//      rest, without writing depth. They get no ink: an outline drawn behind
//      a tinted visor would black out the eyes it is meant to show.
//
// Lighting happens in model space. The model is drawn unrotated with the
// camera on +Z, so a normal's z is how directly a surface faces the viewer.
//
// Two ways to draw. Into the top-left corner of the renderer's own canvas, for
// the caller to copy into a 2D canvas (portraits, and fighters with
// GL3D.LAYER off); or, with `screen`, straight onto a canvas that is itself on
// screen, at the fighter's place under the 2D canvas's transform, with the key
// line and hit flash the 2D path adds drawn here too. Copying a WebGL image
// into a 2D canvas is a read back from the GPU, which on an iPhone was most of
// a 3D fighter's cost; a canvas on screen is composited without one.

import { GL3D } from '../../config.js';

export const MAX_JOINTS = 32;
const DEPTH = 3;                         // model units either side of z = 0

const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 aJoint;
layout(location = 3) in vec4 aWeight;
uniform mat4 uBones[${MAX_JOINTS}];
uniform mat4 uView;
uniform float uInflate;
uniform vec4 uFaceMap;    // face centre across and up; model units the cell spans across, down
uniform float uFaceFront; // how far forward a surface must be to take the face
uniform vec2 uFaceAxis;   // the projection's forward axis in the bind xz plane
uniform vec2 uFaceFade;   // facing at full strength, facing at none
uniform vec2 uSway;       // the anchor's lag, model units; zero for what does not hang
uniform vec3 uSwayHang;   // pivot x, y and reach, in bind space
uniform vec2 uSwayDir;    // the way the mesh hangs from the pivot
out vec3 vNrm;
out vec2 vFaceUV;
out float vFaceMask;
void main() {
  mat4 skin = aWeight.x * uBones[int(aJoint.x)] + aWeight.y * uBones[int(aJoint.y)]
            + aWeight.z * uBones[int(aJoint.z)] + aWeight.w * uBones[int(aJoint.w)];
  vec3 n = normalize(mat3(skin) * aNrm);
  vec4 p = skin * vec4(aPos, 1.0);
  // Secondary motion: the further a vertex hangs from its pivot, the more of
  // the anchor's lag it takes, so a ponytail bends from the tie, not the scalp.
  float hang = clamp(dot(aPos.xy - uSwayHang.xy, uSwayDir) / max(uSwayHang.z, 1e-4), 0.0, 1.0);
  p.xy += uSway * hang * hang;
  p.xyz += n * uInflate;
  vNrm = n;
  gl_Position = uView * p;
  // Bind-space projection, so the face stays where it is on the head. The
  // character's right (+z) is the left of the drawn face, as seen head-on.
  float across = dot(aPos.zx, vec2(uFaceAxis.x, -uFaceAxis.y));
  vFaceUV = vec2(0.5 - (across - uFaceMap.x) / uFaceMap.z, 0.5 - (aPos.y - uFaceMap.y) / uFaceMap.w);
  vFaceMask = step(uFaceFront, dot(aPos.xz, uFaceAxis)) * smoothstep(uFaceFade.y, uFaceFade.x, dot(aNrm.xz, uFaceAxis));
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vNrm;
uniform mat2 uRimDir;     // a model-space direction in the mask's pixel axes
uniform float uFlash;     // 1 while the fighter flashes from a hit
uniform vec3 uColor;
uniform vec3 uKey;
uniform vec3 uTint;       // what shadow does to a colour
uniform vec2 uBands;      // lit threshold, mid threshold
uniform vec3 uBandK;      // lit, mid and dark brightness
uniform vec3 uLit;        // the key light's colour on lit surfaces
uniform vec3 uRimColor;   // the rim on the key side, colour and strength together
uniform vec3 uBack;       // toward the back light
uniform vec3 uBackColor;  // its rim; black for none
uniform float uInk;
uniform float uMaskPass;  // 1 while drawing the silhouette mask
uniform sampler2D uMask;  // that mask, the same size as the canvas
uniform highp vec2 uMaskTexel;  // 1 / its size; highp, as a screen-sized mask is up to 2048 px across
uniform float uRimReach;  // device px out along the normal a rim looks for background
uniform vec3 uInkColor;
uniform sampler2D uFace;
uniform vec4 uFaceCell;   // the expression's rect in the face texture; zero width is no face
uniform float uAlpha;
in vec2 vFaceUV;
in float vFaceMask;
out vec4 outColor;
void main() {
  if (uMaskPass > 0.5) { outColor = vec4(1.0); return; }
  if (uInk > 0.5) { outColor = vec4(uInkColor, 1.0); return; }
  vec3 base = uColor;
  if (uFaceCell.z > 0.0) {
    vec2 uv = clamp(vFaceUV, 0.0, 1.0);
    vec2 inside = step(0.0, vFaceUV) * step(vFaceUV, vec2(1.0));
    vec4 art = texture(uFace, uFaceCell.xy + uv * uFaceCell.zw);
    base = mix(base, art.rgb, art.a * vFaceMask * inside.x * inside.y);
  }
  vec3 n = normalize(vNrm);
  float d = dot(n, uKey);
  vec3 shade = base * uTint;
  vec3 lit = base * uLit;
  vec3 c = d > uBands.x ? lit * uBandK.x
         : d > uBands.y ? mix(lit, shade, 0.5) * uBandK.y
         : shade * uBandK.z;
  float edge = 1.0 - clamp(n.z * 1.6, 0.0, 1.0);
  // Background a few px out along the normal: this is the outline. Body
  // there: an inner edge (a leg over a leg, an arm over the chest), no rim.
  vec2 out2 = uRimDir * n.xy;
  out2 /= max(length(out2), 1e-4);
  float outer = 1.0 - texture(uMask, (gl_FragCoord.xy + out2 * uRimReach) * uMaskTexel).a;
  float rim = step(0.78, edge) * step(0.0, d + 0.25) * outer;
  c += rim * uRimColor;
  float back = step(0.62, edge) * step(0.15, dot(n, uBack)) * outer;
  c += back * uBackColor;
  // The 2D path's hit flash, CSS brightness(2.2) then saturate(0.4).
  if (uFlash > 0.5) {
    c = min(c * 2.2, vec3(1.0));
    c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.4);
  }
  outColor = vec4(c * uAlpha, uAlpha);      // premultiplied, as the canvas is
}`;

// The key line for a fighter drawn on screen: the pale line the 2D path draws
// just outside the finished fighter (drawFighter's keyLine), from this
// fighter's silhouette mask. A pixel outside the silhouette with silhouette
// within uRadius of it is line; the ink and body passes then cover the part of
// it under the ink outline, as the 2D line sits under the body. The mask is
// read through a linear sampler here, so a tap that lands across its edge
// comes back partly covered and the line's outer edge is antialiased; without
// it the edge was a hard step, where the 2D line's is soft.
const KEY_VS = `#version 300 es
uniform vec4 uRect;       // the quad, clip space: x0, y0, x1, y1
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(mix(uRect.xy, uRect.zw, c), 0.0, 1.0);
}`;
const KEY_FS = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uMaskTexel;
uniform float uRadius;    // device px
uniform vec4 uColor;      // premultiplied
out vec4 outColor;
void main() {
  vec2 p = gl_FragCoord.xy;
  if (texture(uMask, p * uMaskTexel).a > 0.5) discard;
  float hit = 0.0;
  for (int i = 0; i < 12; i++) {
    vec2 o = vec2(cos(float(i) * 0.5235988), sin(float(i) * 0.5235988));
    hit = max(hit, texture(uMask, (p + o * uRadius) * uMaskTexel).a);
    hit = max(hit, texture(uMask, (p + o * uRadius * 0.5) * uMaskTexel).a);
  }
  if (hit <= 0.0) discard;
  outColor = uColor * hit;
}`;

const IDENTITY2 = [1, 0, 0, 1];

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export const hexToRGB = (hex) => {
  const h = String(hex || '#ffffff').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

// Returns null where WebGL2 is unavailable, so the caller falls back cleanly.
// `onScreen`: a canvas that is itself on the page, to draw fighters straight
// onto (render's `screen`). It is never read back, so its buffer is not kept.
export function createToon({ onScreen = null } = {}) {
  if (typeof document === 'undefined') return null;
  // How the render reaches the 2D canvas (GL3D.COMPOSITE). 'canvas' keeps the
  // drawing buffer, since drawImage reads it straight after drawing; the other
  // two do not need to. An OffscreenCanvas hands over an ImageBitmap instead.
  const mode = onScreen ? 'screen' : GL3D.COMPOSITE;
  const attrs = {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true,
    preserveDrawingBuffer: mode === 'canvas',
  };
  let canvas = onScreen, gl = onScreen ? onScreen.getContext('webgl2', attrs) : null, bitmap = false;
  if (mode === 'bitmap' && typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(300, 150);
    gl = canvas.getContext('webgl2', attrs);
    bitmap = !!gl && typeof canvas.transferToImageBitmap === 'function';
    if (!bitmap) { canvas = null; gl = null; }
  }
  if (!gl && !onScreen) {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', attrs);
  }
  if (!gl) return null;

  // Everything the context holds: the programs, the key line's sampler, the
  // silhouette mask, face textures and each model's buffers. Made here, and
  // made again when a lost context comes back (webglcontextrestored): the
  // canvas and its context object survive a loss, but nothing on it does.
  let prog, loc, key, mask;
  const textures = new Map();            // key -> texture, least recently used first
  const uploads = new WeakMap();         // model -> { gen, prims }: its buffers on this context
  function build() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    loc = {};
    for (const n of ['uBones', 'uView', 'uInflate', 'uColor', 'uKey', 'uTint', 'uBands', 'uBandK', 'uInk', 'uInkColor',
      'uFace', 'uFaceCell', 'uFaceMap', 'uFaceFront', 'uFaceAxis', 'uFaceFade', 'uAlpha',
      'uLit', 'uRimColor', 'uBack', 'uBackColor', 'uMaskPass', 'uMask', 'uMaskTexel', 'uRimReach',
      'uSway', 'uSwayHang', 'uSwayDir', 'uRimDir', 'uFlash']) {
      loc[n] = gl.getUniformLocation(prog, n);
    }
    gl.useProgram(prog);
    gl.uniform1i(loc.uFace, 0);
    gl.uniform1i(loc.uMask, 1);
    gl.uniformMatrix2fv(loc.uRimDir, false, IDENTITY2);
    gl.uniform1f(loc.uFlash, 0);

    // The key line's program, only for a renderer on screen.
    key = null;
    if (onScreen) {
      const kp = gl.createProgram();
      gl.attachShader(kp, compile(gl, gl.VERTEX_SHADER, KEY_VS));
      gl.attachShader(kp, compile(gl, gl.FRAGMENT_SHADER, KEY_FS));
      gl.linkProgram(kp);
      if (!gl.getProgramParameter(kp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(kp));
      key = { prog: kp, vao: gl.createVertexArray(), sampler: gl.createSampler() };
      gl.samplerParameteri(key.sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(key.sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(key.sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(key.sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      for (const n of ['uRect', 'uMask', 'uMaskTexel', 'uRadius', 'uColor']) key[n] = gl.getUniformLocation(kp, n);
      gl.useProgram(kp);
      gl.uniform1i(key.uMask, 1);
      gl.useProgram(prog);
    }

    // The silhouette mask: a colour texture and a depth buffer the size of the
    // canvas, so a fragment's own coordinates address it. Grown with the canvas.
    mask = { fbo: gl.createFramebuffer(), tex: gl.createTexture(), depth: gl.createRenderbuffer(), w: 0, h: 0 };
    textures.clear();
  }
  build();

  const sizeMask = (w, h) => {
    if (mask.w === w && mask.h === h) return;
    mask.w = w; mask.h = h;
    gl.activeTexture(gl.TEXTURE1);            // unit 0 holds the face; leave it be
    gl.bindTexture(gl.TEXTURE_2D, mask.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, mask.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mask.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mask.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, mask.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  };
  const NO_FACE = [0, 0, 0, 0];
  const NO_SWAY = [0, 0];
  const NONE = new Set(), NO_GLASS = new Map();

  const renderer = {
    canvas,
    gl,
    lost: false,
    generation: 0,                         // goes up each time a lost context is restored
    composite: onScreen ? 'screen' : bitmap ? 'bitmap' : attrs.preserveDrawingBuffer ? 'canvas' : 'nopreserve',

    // A fresh frame on a canvas on screen: sized to match the 2D canvas it sits
    // over, and cleared, so a frame with no 3D fighter in it shows none.
    beginFrame(w, h) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },

    // What to drawImage from once a draw is done, and what to call once the
    // drawImage has run. A bitmap takes the canvas's image with it and must be
    // closed; the canvas itself is simply read.
    image() {
      if (!bitmap) return { src: canvas, done: NO_OP };
      const bmp = canvas.transferToImageBitmap();
      return { src: bmp, done: () => bmp.close() };
    },

    // A model's meshes on this context: uploaded the first time they are
    // asked for, and again after the context has been lost and restored.
    gpu(model) {
      let u = uploads.get(model);
      if (!u || u.gen !== renderer.generation) {
        u = { gen: renderer.generation, prims: renderer.upload(model) };
        uploads.set(model, u);
      }
      return u.prims;
    },

    upload(model) {
      return model.primitives.map((p) => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const attrib = (index, data, size, type) => {
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(index);
          gl.vertexAttribPointer(index, size, type, false, 0, 0);
        };
        attrib(0, p.positions, 3, gl.FLOAT);
        attrib(1, p.normals, 3, gl.FLOAT);
        attrib(2, p.joints, 4, p.joints instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE);
        attrib(3, p.weights, 4, gl.FLOAT);
        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        const indexType = p.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        return { vao, count: p.indices.length, indexType, name: p.name, role: p.role, color: p.color };
      });
    },

    // A texture uploaded earlier under this key, or null. Looking one up marks
    // it recently used.
    texture(key) {
      const tex = textures.get(key);
      if (!tex) return null;
      textures.delete(key);
      textures.set(key, tex);
      return tex;
    },

    // Uploads a canvas as a mipmapped texture under `key`, deleting the least
    // recently used texture once more than GL3D.FACE_TEXTURES are held.
    uploadTexture(key, source) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const old = textures.get(key);
      if (old) gl.deleteTexture(old);
      textures.delete(key);
      textures.set(key, tex);
      for (const [k, t] of textures) {
        if (textures.size <= GL3D.FACE_TEXTURES) break;
        gl.deleteTexture(t);
        textures.delete(k);
      }
      return tex;
    },

    // Draws into the top-left w*ss x h*ss pixels of the canvas: an orthographic
    // view of the rig px box (ox, oy, w, h) around the feet, which is exactly
    // how the procedural buffer is framed. `colours(p)` gives a primitive's
    // colour and `visible(p)` whether this fighter wears it. `squash` is the
    // pose's sx/sy about the feet; `jitter` is a hitstun shake. `face`, when
    // given, is { texture, cell, map, front, axis, fade, mesh, role }: the
    // expression's cell of the face texture and where on which primitive it
    // projects. `inkless` is a Set of roles drawn without an outline, `glass`
    // a Map of see-through roles to their opacity. `light` is a stage's
    // lighting (see GL3D.LIGHT); null lights the fighter as with no stage.
    // `sway(p)`, when given, is a primitive's hang ({ lag, pivot, dir, reach })
    // or null for one that rides its bones rigidly.
    //
    // `screen`, on a renderer made with `onScreen`, draws onto that canvas
    // instead, over what is already there: { m, flash, keyline }, where m is
    // the 2D canvas's transform [a, b, c, d, e, f] from the fighter's local px
    // (feet at the origin, facing +x) to the canvas's device px, flash is the
    // hit flash, and keyline is { px, color, alpha } or null. Facing and the
    // pose's rotation are in m, as they are in the 2D path's transform, so a
    // fighter facing left is drawn mirrored just as the 2D buffer is.
    render(gpu, matrices, {
      colours, box, squash = { x: 1, y: 1 }, jitter = 0, ss = GL3D.SS, visible = () => true, face = null,
      inkless = NONE, glass = NO_GLASS, light = null, sway = null, screen = null,
    }) {
      let vw, vh, view, flip = false, rimDir = IDENTITY2, reach = GL3D.RIM_REACH, keyRect = null, keyRadius = 0;
      if (screen) {
        vw = canvas.width; vh = canvas.height;
        ({ view, flip, rimDir, reach, keyRect, keyRadius } = screenProjection(screen, box, squash, jitter, vw, vh));
        gl.viewport(0, 0, vw, vh);
        gl.clear(gl.DEPTH_BUFFER_BIT);           // each fighter is drawn whole over the last
      } else {
        vw = Math.round(box.w * ss); vh = Math.round(box.h * ss);
        if (canvas.width < vw || canvas.height < vh) {
          canvas.width = Math.max(canvas.width, vw);
          canvas.height = Math.max(canvas.height, vh);
        }
        gl.viewport(0, canvas.height - vh, vw, vh);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        view = bufferProjection(box, squash, jitter);
      }
      const viewport = screen ? [0, 0, vw, vh] : [0, canvas.height - vh, vw, vh];
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.frontFace(flip ? gl.CW : gl.CCW);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(loc.uView, false, view);
      gl.uniformMatrix2fv(loc.uRimDir, false, rimDir);
      gl.uniform1f(loc.uFlash, screen && screen.flash ? 1 : 0);
      gl.uniformMatrix4fv(loc.uBones, false, matrices);
      const L = lighting(light);
      gl.uniform3fv(loc.uKey, L.key);
      gl.uniform3fv(loc.uTint, L.shadow);
      gl.uniform2f(loc.uBands, GL3D.BANDS[0], GL3D.BANDS[1]);
      gl.uniform3fv(loc.uBandK, GL3D.BAND_K);
      gl.uniform3fv(loc.uLit, L.lit);
      gl.uniform3fv(loc.uRimColor, L.rim);
      gl.uniform3fv(loc.uBack, L.back);
      gl.uniform3fv(loc.uBackColor, L.backColor);
      gl.uniform3fv(loc.uInkColor, hexToRGB(GL3D.INK_COLOR));
      gl.uniform4fv(loc.uFaceCell, NO_FACE);
      if (face) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, face.texture);
        gl.uniform4fv(loc.uFaceMap, face.map);
        gl.uniform1f(loc.uFaceFront, face.front);
        gl.uniform2fv(loc.uFaceAxis, face.axis);
        gl.uniform2fv(loc.uFaceFade, face.fade);
      }

      gl.uniform1f(loc.uAlpha, 1);
      gl.uniform1f(loc.uInflate, 0);
      gl.uniform1f(loc.uInk, 0);

      // 0. The silhouette mask, from every opaque primitive this fighter
      // wears, then back to the canvas with the mask bound for the body pass.
      sizeMask(canvas.width, canvas.height);
      // Unbound while it is the target: a texture attached to the framebuffer
      // being drawn and also bound to a sampler is a feedback loop, and WebGL
      // refuses the draw even in a branch that never reads it.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mask.fbo);
      gl.viewport(...viewport);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.cullFace(gl.BACK);
      gl.uniform1f(loc.uMaskPass, 1);
      const swayOf = (p) => {
        const h = sway && sway(p);
        gl.uniform2fv(loc.uSway, h ? h.lag : NO_SWAY);
        if (h) {
          gl.uniform3f(loc.uSwayHang, h.pivot[0], h.pivot[1], h.reach);
          gl.uniform2fv(loc.uSwayDir, h.dir);
        }
      };
      for (const p of gpu) {
        if (!visible(p) || glass.has(p.role)) continue;
        swayOf(p);
        gl.bindVertexArray(p.vao);
        gl.drawElements(gl.TRIANGLES, p.count, p.indexType, 0);
      }
      gl.uniform1f(loc.uMaskPass, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mask.tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(loc.uMaskTexel, 1 / canvas.width, 1 / canvas.height);
      gl.uniform1f(loc.uRimReach, reach);

      // The key line, under everything else this fighter draws.
      if (keyRect) {
        const k = screen.keyline, col = hexToRGB(k.color);
        gl.useProgram(key.prog);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform4fv(key.uRect, keyRect);
        gl.uniform2f(key.uMaskTexel, 1 / canvas.width, 1 / canvas.height);
        gl.uniform1f(key.uRadius, keyRadius);
        gl.uniform4f(key.uColor, col[0] * k.alpha, col[1] * k.alpha, col[2] * k.alpha, k.alpha);
        gl.bindVertexArray(key.vao);
        gl.bindSampler(1, key.sampler);       // the mask, read linear for this pass only
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindSampler(1, null);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.useProgram(prog);
      }

      for (const pass of ['ink', 'body', 'glass']) {
        const ink = pass === 'ink';
        if (pass === 'glass') {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
        }
        gl.cullFace(ink ? gl.FRONT : gl.BACK);
        gl.uniform1f(loc.uInk, ink ? 1 : 0);
        gl.uniform1f(loc.uInflate, ink ? GL3D.INK : 0);
        for (const p of gpu) {
          if (!visible(p)) continue;
          const alpha = glass.get(p.role);
          const skip = pass === 'glass' ? alpha === undefined : alpha !== undefined || (ink && inkless.has(p.role));
          if (skip) continue;
          const faced = pass === 'body' && face && p.name === face.mesh && p.role === face.role;
          if (!ink) gl.uniform3fv(loc.uColor, colours(p));
          if (alpha !== undefined) gl.uniform1f(loc.uAlpha, alpha);
          if (faced) gl.uniform4fv(loc.uFaceCell, face.cell);
          swayOf(p);
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.count, p.indexType, 0);
          if (faced) gl.uniform4fv(loc.uFaceCell, NO_FACE);
        }
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(loc.uAlpha, 1);
      gl.uniform1f(loc.uFlash, 0);
      gl.uniformMatrix2fv(loc.uRimDir, false, IDENTITY2);
      gl.frontFace(gl.CCW);
      gl.bindVertexArray(null);
      // The viewport sits at the top of the canvas image, so the drawn region
      // is the source rect (0, 0, vw, vh) for drawImage.
      return { vw, vh };
    },

    finish() { gl.finish(); },
  };

  // A phone can take the GPU away (the app sent to the background, memory
  // pressure). preventDefault asks the browser to give the context back; when
  // it does, everything on it is made again and the next frame draws in 3D. In
  // between, `lost` sends every fighter to the 2D rig.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer.lost = true; });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      build();
      renderer.generation += 1;
      renderer.lost = false;
    } catch (e) {
      console.warn('[gl3d] could not restore:', e);     // stays lost: the 2D rig draws
    }
  });
  return renderer;
}

const NO_OP = () => {};

// Where a fighter drawn on screen lands (render's `screen`), worked out on the
// CPU: the clip-space view matrix, whether it mirrors (and so turns the
// winding over), the map from a model-space direction to the mask's pixel axes
// for the rim, the rim's reach and the key line's radius in device px, and the
// key line's quad in clip space (null without a key line). Pure, so a test can
// hold it to the buffer path: a model point must land on the same device pixel
// either way. `screen.m` is [a, b, c, d, e, f], local px -> device px.
export function screenProjection(screen, box, squash, jitter, vw, vh) {
  const U = GL3D.UNIT;
  const [a, b, c, d, e, f] = screen.m;
  const kx = squash.x * U, ky = squash.y * U;
  const ex = a * jitter + e, fy = b * jitter + f;
  // model units -> local px (kx, ky, jitter) -> device px (m) -> clip space,
  // with the canvas's y down turned up
  const view = [
    (2 * a * kx) / vw, (-2 * b * kx) / vh, 0, 0,
    (-2 * c * ky) / vw, (2 * d * ky) / vh, 0, 0,
    0, 0, -1 / DEPTH, 0,
    (2 * ex) / vw - 1, 1 - (2 * fy) / vh, 0, 1,
  ];
  const det = a * d - b * c;
  const px = Math.sqrt(Math.abs(det));      // device px per local px
  const out = {
    view,
    flip: det < 0,                          // mirrored: the winding turns over
    rimDir: [a * kx, -b * kx, -c * ky, d * ky],
    reach: (GL3D.RIM_REACH / GL3D.SS) * px, // the same reach in local px as in the buffer
    keyRect: null,
    keyRadius: 0,
  };
  if (screen.keyline) {
    out.keyRadius = (GL3D.INK * U + screen.keyline.px) * px;
    // The quad: the box's corners on screen, out by the line's reach.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const lx of [-box.ox + jitter, box.w - box.ox + jitter]) {
      for (const ly of [-box.oy, box.h - box.oy]) {
        const dx = a * lx + c * ly + e, dy = b * lx + d * ly + f;
        x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy);
      }
    }
    const r = out.keyRadius + 2;
    out.keyRect = [((x0 - r) / vw) * 2 - 1, 1 - ((y1 + r) / vh) * 2, ((x1 + r) / vw) * 2 - 1, 1 - ((y0 - r) / vh) * 2];
  }
  return out;
}

// The buffer path's view matrix (render without `screen`): the box framed
// in the top-left vw x vh pixels of the renderer's own canvas.
export function bufferProjection(box, squash, jitter) {
  const U = GL3D.UNIT;
  const l = -box.ox / U, r = (box.w - box.ox) / U;
  const t = box.oy / U, b = -(box.h - box.oy) / U;
  return [
    (2 * squash.x) / (r - l), 0, 0, 0,
    0, (2 * squash.y) / (t - b), 0, 0,
    0, 0, -1 / DEPTH, 0,
    (2 * (jitter / U) - (r + l)) / (r - l), -(t + b) / (t - b), 0, 1,
  ];
}

function normalizeKey(k) {
  const l = Math.hypot(k[0], k[1], k[2]) || 1;
  return [k[0] / l, k[1] / l, k[2] / l];
}

// A stage's light over the defaults, ready for the shader. The defaults are
// the look with no stage, so lighting(null) changes nothing.
export function lighting(light) {
  const D = GL3D.LIGHT;
  return {
    key: normalizeKey(light?.key || GL3D.KEY),
    lit: light?.lit || D.LIT,
    shadow: light?.shadow || GL3D.SHADOW_TINT,
    rim: light?.rim || GL3D.RIM_COLOR.map((v) => v * GL3D.RIM),
    back: normalizeKey(light?.back || D.BACK),
    backColor: light?.backColor || D.BACK_COLOR,
  };
}
