import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Reads exactly what tools/pieces makes: a GLB of single-primitive meshes, meshopt-compressed and quantized
// (EXT_meshopt_compression, KHR_mesh_quantization). GLTFLoader does the same with ~20 KB more (gzipped) for the
// page to fetch and parse; this keeps only the decoder. Returns plain float geometry per node name, in scene units.
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// attributes: [three name, glTF name, components to keep]
export async function readGlb(buffer, attributes) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const bin = new Uint8Array(buffer, 28 + jsonLength, dv.getUint32(20 + jsonLength, true));
  await MeshoptDecoder.ready;

  const views = json.bufferViews.map((v) => {
    const m = v.extensions?.EXT_meshopt_compression;
    if (!m) return { bytes: bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), stride: v.byteStride };
    const bytes = new Uint8Array(m.count * m.byteStride);
    const src = bin.subarray(m.byteOffset || 0, (m.byteOffset || 0) + m.byteLength);
    MeshoptDecoder.decodeGltfBuffer(bytes, m.count, m.byteStride, src, m.mode, m.filter);
    return { bytes, stride: m.byteStride };
  });

  const elements = (a) => {
    const T = TYPES[a.componentType], v = views[a.bufferView];
    const bytes = v.bytes.slice(a.byteOffset || 0);           // a copy of its own, so any element type is aligned
    return { T, src: new T(bytes.buffer, 0, bytes.byteLength / T.BYTES_PER_ELEMENT | 0), stride: (v.stride || SIZE[a.type] * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT };
  };
  const floats = (i, n) => {
    const a = json.accessors[i];
    const { src, stride } = elements(a);
    const k = a.normalized ? NORM[a.componentType] : 1;
    const out = new Float32Array(a.count * n);
    for (let j = 0; j < a.count; j++) for (let c = 0; c < n; c++) out[j * n + c] = Math.max(src[j * stride + c] / k, -1);
    return new THREE.BufferAttribute(out, n);
  };
  const indices = (i) => {
    const a = json.accessors[i];
    const { T, src } = elements(a);
    return new THREE.BufferAttribute(new T(src.subarray(0, a.count)), 1);
  };

  const out = {};
  const walk = (i, parent) => {
    const node = json.nodes[i];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
    const world = new THREE.Matrix4().multiplyMatrices(parent, local);
    if (node.mesh !== undefined) {
      const prim = json.meshes[node.mesh].primitives[0];
      const g = new THREE.BufferGeometry();
      for (const [name, key, n] of attributes) g.setAttribute(name, floats(prim.attributes[key], n));
      g.setIndex(indices(prim.indices));
      out[node.name] = g.applyMatrix4(world);
    }
    node.children?.forEach((c) => walk(c, world));
  };
  json.scenes[json.scene || 0].nodes.forEach((i) => walk(i, new THREE.Matrix4()));
  return out;
}
