// 数据加密工具 - 基于 SM4 国密对称加密
// 用于本地缓存与云数据库数据的加密存储
// 采用固定密钥（方案 A：前端加密，密钥在客户端，防普通用户查看）
const sm4 = require('./sm4');

// 加密版本标记：用于识别密文与兼容旧明文数据
const PREFIX = 'ENC:FB1:';

// SM4 密钥（128 位 = 16 字节）
// 注意：前端密钥可被逆向，仅用于防普通用户直接查看存储内容
const SECRET_KEY = 'fb-finance-20261';

// 加密对象/字符串，返回带版本标记的密文字符串
function encrypt(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const cipher = sm4.encrypt(str, SECRET_KEY);
  return PREFIX + cipher;
}

// 解密，返回原始字符串；若为旧明文数据则原样返回
function decrypt(stored) {
  if (typeof stored !== 'string') {
    // 非字符串（如旧版本直接存的对象），尝试序列化后解密失败则原样返回
    return stored;
  }
  if (stored.indexOf(PREFIX) === 0) {
    return _decrypt(stored.substring(PREFIX.length));
  }
  // 旧明文数据，原样返回
  return stored;
}

// 解密密文主体（去掉前缀后的部分）
function _decrypt(cipher) {
  try {
    return sm4.decrypt(cipher, SECRET_KEY);
  } catch (e) {
    // 解密失败（密钥变更或数据损坏），返回空串避免崩溃
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};
