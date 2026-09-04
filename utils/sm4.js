// SM4 国密对称加密算法（纯 JS 实现，无外部依赖）
// 分组长度 128 位（16 字节），密钥长度 128 位（16 字节）
// 提供 ECB 模式 + PKCS7 填充的加密/解密，以及便捷的字符串加解密接口

// S 盒
const SBOX = [
  0xd6, 0x90, 0xe9, 0xfe, 0xcc, 0xe1, 0x3d, 0xb7, 0x16, 0xb6, 0x14, 0xc2, 0x28, 0xfb, 0x2c, 0x05,
  0x2b, 0x67, 0x9a, 0x76, 0x2a, 0xbe, 0x04, 0xc3, 0xaa, 0x44, 0x13, 0x26, 0x49, 0x86, 0x06, 0x99,
  0x9c, 0x42, 0x50, 0xf4, 0x91, 0xef, 0x98, 0x7a, 0x33, 0x54, 0x0b, 0x43, 0xed, 0xcf, 0xac, 0x62,
  0xe4, 0xb3, 0x1c, 0xa9, 0xc9, 0x08, 0xe8, 0x95, 0x80, 0xdf, 0x94, 0xfa, 0x75, 0x8f, 0x3f, 0xa6,
  0x47, 0x07, 0xa7, 0xfc, 0xf3, 0x73, 0x17, 0xba, 0x83, 0x59, 0x3c, 0x19, 0xe6, 0x85, 0x4f, 0xa8,
  0x68, 0x6b, 0x81, 0xb2, 0x71, 0x64, 0xda, 0x8b, 0xf8, 0xeb, 0x0f, 0x4b, 0x70, 0x56, 0x9d, 0x35,
  0x1e, 0x24, 0x0e, 0x5e, 0x63, 0x58, 0xd1, 0xa2, 0x25, 0x22, 0x7c, 0x3b, 0x01, 0x21, 0x78, 0x87,
  0xd4, 0x00, 0x46, 0x57, 0x9f, 0xd3, 0x27, 0x52, 0x4c, 0x36, 0x02, 0xe7, 0xa0, 0xc4, 0xc8, 0x9e,
  0xea, 0xbf, 0x8a, 0xd2, 0x40, 0xc7, 0x38, 0xb5, 0xa3, 0xf7, 0xf2, 0xce, 0xf9, 0x61, 0x15, 0xa1,
  0xe0, 0xae, 0x5d, 0xa4, 0x9b, 0x34, 0x1a, 0x55, 0xad, 0x93, 0x32, 0x30, 0xf5, 0x8c, 0xb1, 0xe3,
  0x1d, 0xf6, 0xe2, 0x2e, 0x82, 0x66, 0xca, 0x60, 0xc0, 0x29, 0x23, 0xab, 0x0d, 0x53, 0x4e, 0x6f,
  0xd5, 0xdb, 0x37, 0x45, 0xde, 0xfd, 0x8e, 0x2f, 0x03, 0xff, 0x6a, 0x72, 0x6d, 0x6c, 0x5b, 0x51,
  0x8d, 0x1b, 0xaf, 0x92, 0xbb, 0xdd, 0xbc, 0x7f, 0x11, 0xd9, 0x5c, 0x41, 0x1f, 0x10, 0x5a, 0xd8,
  0x0a, 0xc1, 0x31, 0x88, 0xa5, 0xcd, 0x7b, 0xbd, 0x2d, 0x74, 0xd0, 0x12, 0xb8, 0xe5, 0xb4, 0xb0,
  0x89, 0x69, 0x97, 0x4a, 0x0c, 0x96, 0x77, 0x7e, 0x65, 0xb9, 0xf1, 0x09, 0xc5, 0x6e, 0xc6, 0x84,
  0x18, 0xf0, 0x7d, 0xec, 0x3a, 0xdc, 0x4d, 0x20, 0x79, 0xee, 0x5f, 0x3e, 0xd7, 0xcb, 0x39, 0x48
];

// 固定参数 FK
const FK = [0xa3b1bac6, 0x56aa3350, 0x677d9197, 0xb27022dc];

// 固定参数 CK
const CK = [
  0x00070e15, 0x1c232a31, 0x383f464d, 0x545b6269,
  0x70777e85, 0x8c939aa1, 0xa8afb6bd, 0xc4cbd2d9,
  0xe0e7eef5, 0xfc030a11, 0x181f262d, 0x343b4249,
  0x50575e65, 0x6c737a81, 0x888f969d, 0xa4abb2b9,
  0xc0c7ced5, 0xdce3eaf1, 0xf8ff060d, 0x141b2229,
  0x30373e45, 0x4c535a61, 0x686f767d, 0x848b9299,
  0xa0a7aeb5, 0xbcc3cad1, 0xd8dfe6ed, 0xf4fb0209,
  0x10171e25, 0x2c333a41, 0x484f565d, 0x646b7279
];

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function byteSub(x) {
  return (
    (SBOX[(x >>> 24) & 0xff] << 24) |
    (SBOX[(x >>> 16) & 0xff] << 16) |
    (SBOX[(x >>> 8) & 0xff] << 8) |
    SBOX[x & 0xff]
  ) >>> 0;
}

// 线性变换 L（加密）
function L1(b) {
  return (b ^ rotl(b, 2) ^ rotl(b, 10) ^ rotl(b, 18) ^ rotl(b, 24)) >>> 0;
}

// 线性变换 L'（密钥扩展）
function L2(b) {
  return (b ^ rotl(b, 13) ^ rotl(b, 23)) >>> 0;
}

// 密钥扩展：生成 32 轮轮密钥
function keyExpansion(keyBytes) {
  const MK = [];
  for (let i = 0; i < 4; i++) {
    MK.push(
      ((keyBytes[i * 4] << 24) |
        (keyBytes[i * 4 + 1] << 16) |
        (keyBytes[i * 4 + 2] << 8) |
        keyBytes[i * 4 + 3]) >>> 0
    );
  }
  const K = [];
  for (let i = 0; i < 4; i++) {
    K.push((MK[i] ^ FK[i]) >>> 0);
  }
  const rk = [];
  for (let i = 0; i < 32; i++) {
    const t = (K[1] ^ K[2] ^ K[3] ^ CK[i]) >>> 0;
    K[0] = (K[0] ^ L2(byteSub(t))) >>> 0;
    rk[i] = K[0];
    K[0] = K[1];
    K[1] = K[2];
    K[2] = K[3];
    K[3] = rk[i];
  }
  return rk;
}

// 加密一个 16 字节分组
function encryptBlock(block, rk) {
  let x = [];
  for (let i = 0; i < 4; i++) {
    x.push(
      ((block[i * 4] << 24) |
        (block[i * 4 + 1] << 16) |
        (block[i * 4 + 2] << 8) |
        block[i * 4 + 3]) >>> 0
    );
  }
  for (let i = 0; i < 32; i++) {
    const t = (x[1] ^ x[2] ^ x[3] ^ rk[i]) >>> 0;
    const tmp = (x[0] ^ L1(byteSub(t))) >>> 0;
    x[0] = x[1];
    x[1] = x[2];
    x[2] = x[3];
    x[3] = tmp;
  }
  // 反序输出
  const out = new Uint8Array(16);
  const y = [x[3], x[2], x[1], x[0]];
  for (let i = 0; i < 4; i++) {
    out[i * 4] = (y[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (y[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (y[i] >>> 8) & 0xff;
    out[i * 4 + 3] = y[i] & 0xff;
  }
  return out;
}

// 解密一个 16 字节分组（轮密钥逆序）
function decryptBlock(block, rk) {
  const rkRev = rk.slice().reverse();
  return encryptBlock(block, rkRev);
}

// 字符串 -> 字节数组（UTF-8）
function strToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      // 代理对
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

// 字节数组 -> 字符串（UTF-8）
function bytesToStr(bytes) {
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      str += String.fromCharCode(b);
      i++;
    } else if (b < 0xe0) {
      str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const code =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      const c = code - 0x10000;
      str += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
      i += 4;
    }
  }
  return str;
}

// PKCS7 填充
function pkcs7Pad(data) {
  const blockSize = 16;
  const padLen = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) {
    padded[i] = padLen;
  }
  return padded;
}

// 去除 PKCS7 填充
function pkcs7Unpad(data) {
  if (data.length === 0) return data;
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 16) return data;
  return data.subarray(0, data.length - padLen);
}

// 加密字符串，返回 Base64 字符串
function encrypt(str, keyStr) {
  const keyBytes = strToBytes(keyStr);
  if (keyBytes.length !== 16) {
    throw new Error('SM4 密钥必须为 16 字节（128 位）');
  }
  const rk = keyExpansion(keyBytes);
  const dataBytes = strToBytes(str);
  const padded = pkcs7Pad(dataBytes);
  const out = new Uint8Array(padded.length);
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.subarray(i, i + 16);
    const enc = encryptBlock(block, rk);
    out.set(enc, i);
  }
  return bytesToBase64(out);
}

// 解密 Base64 字符串，返回原始字符串
function decrypt(b64, keyStr) {
  const keyBytes = strToBytes(keyStr);
  if (keyBytes.length !== 16) {
    throw new Error('SM4 密钥必须为 16 字节（128 位）');
  }
  const rk = keyExpansion(keyBytes);
  const dataBytes = base64ToBytes(b64);
  if (dataBytes.length === 0 || dataBytes.length % 16 !== 0) {
    throw new Error('密文长度非法');
  }
  const out = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i += 16) {
    const block = dataBytes.subarray(i, i + 16);
    const dec = decryptBlock(block, rk);
    out.set(dec, i);
  }
  const unpadded = pkcs7Unpad(out);
  return bytesToStr(unpadded);
}

// 字节数组 -> Base64
function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 0x3f] : '=';
  }
  return result;
}

// Base64 -> 字节数组
function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map = {};
  for (let i = 0; i < chars.length; i++) map[chars[i]] = i;
  b64 = b64.replace(/=+$/, '');
  const bytes = [];
  for (let i = 0; i < b64.length; i += 4) {
    const c0 = map[b64[i]];
    const c1 = map[b64[i + 1]];
    const c2 = b64[i + 2] !== undefined ? map[b64[i + 2]] : undefined;
    const c3 = b64[i + 3] !== undefined ? map[b64[i + 3]] : undefined;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 !== undefined) bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 !== undefined) bytes.push(((c2 & 0x03) << 6) | c3);
  }
  return new Uint8Array(bytes);
}

module.exports = {
  encrypt,
  decrypt
};
