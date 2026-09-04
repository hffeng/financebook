// 日期工具
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 获取当前日期 YYYY-MM-DD
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

// 解析 YYYY-MM-DD 为 Date
function parseDate(str) {
  if (!str) return new Date();
  const parts = str.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// 获取某月第一天 YYYY-MM-DD
function monthStart(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
}

// 获取某月最后一天 YYYY-MM-DD
function monthEnd(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
}

// 获取最近 N 天的日期数组（含今天），从旧到新
function lastNDays(n) {
  const result = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    result.push(formatDate(d));
  }
  return result;
}

// 获取最近 N 个月的月份标签数组，从旧到新，格式 YYYY-MM
function lastNMonths(n) {
  const result = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(d.getFullYear() + '-' + pad(d.getMonth() + 1));
  }
  return result;
}

// 获取最近 N 个月每月最后一天的日期数组，从旧到新，格式 YYYY-MM-DD
// 当月使用今天（以便包含当月已录入的记录）
function lastNMonthEnds(n) {
  const result = [];
  const now = new Date();
  const currentMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (m === currentMonth) {
      result.push(today());
    } else {
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      result.push(m + '-' + pad(lastDay));
    }
  }
  return result;
}

// 人性化显示日期：今天/昨天/MM月DD日
function friendlyDate(str) {
  if (!str) return '';
  const todayStr = today();
  if (str === todayStr) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (str === formatDate(yesterday)) return '昨天';
  const parts = str.split('-');
  return Number(parts[1]) + '月' + Number(parts[2]) + '日';
}

// 完整日期：YYYY年M月D日
function fullDate(str) {
  if (!str) return '';
  const parts = str.split('-');
  return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
}

module.exports = {
  today,
  formatDate,
  parseDate,
  monthStart,
  monthEnd,
  lastNDays,
  lastNMonths,
  lastNMonthEnds,
  friendlyDate,
  fullDate
};
