// A minimal glTF 2.0 binary (.glb) reader for skinned models. RENDER-ONLY.
//
// Reads exactly what the live 3D renderer needs and refuses anything else
// loudly: one skin, triangle primitives with POSITION, NORMAL, JOINTS_0 and
// WEIGHTS_0, indexed, with a base colour per material. That is what
// lab/blender/build_adam.py exports, and what Blender's own glTF exporter
// writes for a hand-built model that follows the same contract.

import { invertAffine, translationOf } from './math.js';

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const MAGIC = 0x46546c67;        // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const TRIANGLES = 4;

export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a .glb file');
  let json = null, bin = null;
  for (let off = 12; off < buffer.byteLength;) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = buffer.slice(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === CHUNK_BIN) bin = body;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('.glb is missing its JSON or BIN chunk');
  return { json, bin };
}

export function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Type = COMPONENT[acc.componentType];
  const width = WIDTH[acc.type];
  if (!Type || !width) throw new Error(`unsupported accessor ${acc.componentType}/${acc.type}`);
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || width * Type.BYTES_PER_ELEMENT;
  if (stride === width * Type.BYTES_PER_ELEMENT) {
    return new Type(bin.slice(start, start + acc.count * width * Type.BYTES_PER_ELEMENT));
  }
  // Interleaved: copy element by element.
  const out = new Type(acc.count * width);
  const src = new Type(bin, 0, Math.floor(bin.byteLength / Type.BYTES_PER_ELEMENT));
  for (let i = 0; i < acc.count; i++) {
    const base = (start + i * stride) / Type.BYTES_PER_ELEMENT;
    for (let k = 0; k < width; k++) out[i * width + k] = src[base + k];
  }
  return out;
}

const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// Joint names and REST positions, plus one draw record per primitive. Joint
// positions come from the inverse bind matrices, so the model's own bone rolls
// and axis conventions never matter: only where each joint sits at bind time.
export function extractModel({ json, bin }) {
  if (!json.skins || json.skins.length !== 1) throw new Error('expected exactly one skin');
  const skin = json.skins[0];
  const jointNames = skin.joints.map((j) => json.nodes[j].name);
  const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
  const restHeads = jointNames.map((_, i) => translationOf(invertAffine(Array.from(ibm.subarray(i * 16, i * 16 + 16)))));

  const primitives = [];
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    if (node.translation || node.rotation || node.scale || node.matrix) {
      throw new Error(`mesh node "${node.name}" has a transform; apply it before export`);
    }
    for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? TRIANGLES) !== TRIANGLES) throw new Error('only triangle primitives are supported');
      const a = prim.attributes;
      for (const need of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) {
        if (a[need] === undefined) throw new Error(`primitive in "${node.name}" has no ${need}`);
      }
      if (prim.indices === undefined) throw new Error(`primitive in "${node.name}" is not indexed`);
      const mat = json.materials?.[prim.material] || {};
      const base = mat.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
      primitives.push({
        name: node.name,
        role: mat.name || '',
        color: [toSRGB(base[0]), toSRGB(base[1]), toSRGB(base[2])],
        positions: readAccessor(json, bin, a.POSITION),
        normals: readAccessor(json, bin, a.NORMAL),
        joints: readAccessor(json, bin, a.JOINTS_0),
        weights: readAccessor(json, bin, a.WEIGHTS_0),
        indices: readAccessor(json, bin, prim.indices),
      });
    }
  }
  return { jointNames, restHeads, primitives };
}
