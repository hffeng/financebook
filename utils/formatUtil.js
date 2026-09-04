// 格式化工具
// 金额格式化：12345.6 -> 12,346（四舍五入为整数，带千分位）
function formatAmount(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const n = Number(num);
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 输入时千分位格式化：1234567.89 -> 1,234,567.89（保留最多两位小数，支持负数）
function formatInputAmount(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).replace(/,/g, '');
  const negative = str.indexOf('-') === 0;
  str = str.replace(/-/g, '');
  // 只保留数字和一个小数点
  const parts = str.split('.');
  let intPart = parts[0].replace(/\D/g, '');
  const decPart = parts.length > 1 ? '.' + parts.slice(1).join('').replace(/\D/g, '').slice(0, 2) : '';
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + intPart + decPart;
}

// 解析带千分位的金额字符串：'1,234.56' -> 1234.56
function parseAmount(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return parseFloat(String(value).replace(/,/g, ''));
}

// 生成唯一 ID
function genId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  formatAmount,
  formatInputAmount,
  parseAmount,
  genId
};
