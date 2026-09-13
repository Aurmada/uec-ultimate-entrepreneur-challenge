// WebGL2 toon renderer for skinned models. RENDER-ONLY. No library: one
// program, one vertex array per primitive, two passes per draw.
//
//   1. INK: back faces pushed out along their normals, flat ink colour. Only
//      the sliver that clears the body survives the depth test, which gives the
//      silhouette line and the line between a limb and the torso behind it.
//   2. BODY: front faces, lit in three flat bands with a rim on the lit side.
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
out vec3 vNrm;
void main() {
  mat4 skin = aWeight.x * uBones[int(aJoint.x)] + aWeight.y * uBones[int(aJoint.y)]
            + aWeight.z * uBones[int(aJoint.z)] + aWeight.w * uBones[int(aJoint.w)];
  vec3 n = normalize(mat3(skin) * aNrm);
  vec4 p = skin * vec4(aPos, 1.0);
  p.xyz += n * uInflate;
  vNrm = n;
  gl_Position = uView * p;
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
out vec4 outColor;
void main() {
  if (uInk > 0.5) { outColor = vec4(uInkColor, 1.0); return; }
  vec3 n = normalize(vNrm);
  float d = dot(n, uKey);
  vec3 shade = uColor * uTint;
  vec3 c = d > uBands.x ? uColor * uBandK.x
         : d > uBands.y ? mix(uColor, shade, 0.5) * uBandK.y
         : shade * uBandK.z;
  float edge = 1.0 - clamp(n.z * 1.6, 0.0, 1.0);
  float rim = step(0.78, edge) * step(0.0, d + 0.25);
  c += rim * uBands.z * vec3(0.5, 0.47, 0.42);
  outColor = vec4(c, 1.0);
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
  for (const n of ['uBones', 'uView', 'uInflate', 'uColor', 'uKey', 'uTint', 'uBands', 'uBandK', 'uInk', 'uInkColor']) {
    loc[n] = gl.getUniformLocation(prog, n);
  }

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

    // Draws into the top-left w*SS x h*SS pixels of the canvas, framed exactly
    // like the procedural buffer: rig px box (ox, oy, w, h) around the feet.
    // `squash` is the pose's sx/sy about the feet; `jitter` is a hitstun shake;
    // `visible(p)` picks which primitives this fighter wears.
    render(gpu, matrices, colours, box, squash, jitter = 0, visible = () => true) {
      const ss = GL3D.SS, U = GL3D.UNIT;
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

      for (const pass of [1, 0]) {
        gl.cullFace(pass ? gl.FRONT : gl.BACK);
        gl.uniform1f(loc.uInk, pass);
        gl.uniform1f(loc.uInflate, pass ? GL3D.INK : 0);
        for (const p of gpu) {
          if (!visible(p)) continue;
          if (!pass) gl.uniform3fv(loc.uColor, colours(p));
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.count, p.indexType, 0);
        }
      }
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
