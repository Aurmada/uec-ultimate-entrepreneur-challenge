// WebGL2 toon renderer for skinned models. RENDER-ONLY. No library: one
// program, one vertex array per primitive, two passes per draw.
//
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
out vec3 vNrm;
out vec2 vFaceUV;
out float vFaceMask;
void main() {
  mat4 skin = aWeight.x * uBones[int(aJoint.x)] + aWeight.y * uBones[int(aJoint.y)]
            + aWeight.z * uBones[int(aJoint.z)] + aWeight.w * uBones[int(aJoint.w)];
  vec3 n = normalize(mat3(skin) * aNrm);
  vec4 p = skin * vec4(aPos, 1.0);
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
uniform vec3 uColor;
uniform vec3 uKey;
uniform vec3 uTint;
uniform vec3 uBands;      // lit threshold, mid threshold, rim strength
uniform vec3 uBandK;      // lit, mid and dark brightness
uniform float uInk;
uniform vec3 uInkColor;
uniform sampler2D uFace;
uniform vec4 uFaceCell;   // the expression's rect in the face texture; zero width is no face
uniform float uAlpha;
in vec2 vFaceUV;
in float vFaceMask;
out vec4 outColor;
void main() {
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
  vec3 c = d > uBands.x ? base * uBandK.x
         : d > uBands.y ? mix(base, shade, 0.5) * uBandK.y
         : shade * uBandK.z;
  float edge = 1.0 - clamp(n.z * 1.6, 0.0, 1.0);
  float rim = step(0.78, edge) * step(0.0, d + 0.25);
  c += rim * uBands.z * vec3(0.5, 0.47, 0.42);
  outColor = vec4(c * uAlpha, uAlpha);      // premultiplied, as the canvas is
}`;

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
export function createToon() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true,
    // drawImage reads this canvas straight after drawing; keep the buffer.
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const loc = {};
  for (const n of ['uBones', 'uView', 'uInflate', 'uColor', 'uKey', 'uTint', 'uBands', 'uBandK', 'uInk', 'uInkColor',
    'uFace', 'uFaceCell', 'uFaceMap', 'uFaceFront', 'uFaceAxis', 'uFaceFade', 'uAlpha']) {
    loc[n] = gl.getUniformLocation(prog, n);
  }
  gl.useProgram(prog);
  gl.uniform1i(loc.uFace, 0);
  const NO_FACE = [0, 0, 0, 0];
  const NONE = new Set(), NO_GLASS = new Map();
  const textures = new Map();            // key -> texture, least recently used first

  const renderer = {
    canvas,
    lost: false,

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
    // a Map of see-through roles to their opacity.
    render(gpu, matrices, {
      colours, box, squash = { x: 1, y: 1 }, jitter = 0, ss = GL3D.SS, visible = () => true, face = null,
      inkless = NONE, glass = NO_GLASS,
    }) {
      const U = GL3D.UNIT;
      const vw = Math.round(box.w * ss), vh = Math.round(box.h * ss);
      if (canvas.width < vw || canvas.height < vh) {
        canvas.width = Math.max(canvas.width, vw);
        canvas.height = Math.max(canvas.height, vh);
      }
      gl.viewport(0, canvas.height - vh, vw, vh);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.useProgram(prog);

      const l = -box.ox / U, r = (box.w - box.ox) / U;
      const t = box.oy / U, b = -(box.h - box.oy) / U;
      gl.uniformMatrix4fv(loc.uView, false, [
        (2 * squash.x) / (r - l), 0, 0, 0,
        0, (2 * squash.y) / (t - b), 0, 0,
        0, 0, -1 / DEPTH, 0,
        (2 * (jitter / U) - (r + l)) / (r - l), -(t + b) / (t - b), 0, 1,
      ]);
      gl.uniformMatrix4fv(loc.uBones, false, matrices);
      gl.uniform3fv(loc.uKey, normalizeKey(GL3D.KEY));
      gl.uniform3fv(loc.uTint, GL3D.SHADOW_TINT);
      gl.uniform3f(loc.uBands, GL3D.BANDS[0], GL3D.BANDS[1], GL3D.RIM);
      gl.uniform3fv(loc.uBandK, GL3D.BAND_K);
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
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.count, p.indexType, 0);
          if (faced) gl.uniform4fv(loc.uFaceCell, NO_FACE);
        }
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(loc.uAlpha, 1);
      gl.bindVertexArray(null);
      // The viewport sits at the top of the canvas image, so the drawn region
      // is the source rect (0, 0, vw, vh) for drawImage.
      return { vw, vh };
    },

    finish() { gl.finish(); },
  };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer.lost = true; });
  return renderer;
}

function normalizeKey(k) {
  const l = Math.hypot(k[0], k[1], k[2]) || 1;
  return [k[0] / l, k[1] / l, k[2] / l];
}
