// 本地存储服务 - 封装 wx.setStorage 读写操作
// 数据以本地缓存为主，同时同步到云数据库，实现多用户共享（后写覆盖）
const { genId } = require('../utils/formatUtil');
const dateUtil = require('../utils/dateUtil');
const crypto = require('../utils/crypto');

const KEYS = {
  MEMBERS: 'fb_members',
  RECORDS: 'fb_records',
  CATEGORIES: 'fb_categories',
  ANCHORS: 'fb_asset_anchors',
  ASSETS: 'fb_assets',
  ASSET_RECORDS: 'fb_asset_records',
  GOALS: 'fb_goals',
  SETTINGS: 'fb_settings',
  // 数据迁移标志位（独立本地 key，不参与云同步，避免被云端 settings 覆盖导致重复迁移）
  MIGRATION_FLAGS: 'fb_migration_flags'
};

// ============ 云数据库配置 ============
// 所有数据存放在一个集合 fb 中，每个数据类型对应一个文档
const CLOUD_COLLECTION = 'fb';
// 本地 key -> 云文档 id 映射
const CLOUD_DOC_MAP = {
  'fb_members': 'members',
  'fb_records': 'records',
  'fb_categories': 'categories',
  'fb_asset_anchors': 'asset_anchors',
  'fb_assets': 'assets',
  'fb_asset_records': 'asset_records',
  'fb_goals': 'goals',
  'fb_settings': 'settings'
};

let cloudReady = false;
let networkAvailable = true;

function getDb() {
  return wx.cloud.database();
}

// 从云数据库拉取某个文档到本地缓存
function pullFromCloud(key) {
  const docId = CLOUD_DOC_MAP[key];
  if (!docId) return Promise.resolve();
  return getDb().collection(CLOUD_COLLECTION).doc(docId).get()
    .then(res => {
      if (res.data && res.data.data !== undefined) {
        writeLocal(key, res.data.data);
      }
    })
    .catch(() => {
      // 文档不存在或网络异常，保留本地缓存（降级）
    });
}

// 判断数据是否为空（空数组 / 空对象 / null / undefined / 空串）
function isEmptyData(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// 将本地缓存推送到云数据库（后写覆盖）
// 保护：若本地数据为空而云端已有数据，则跳过推送，避免空数据覆盖云端导致数据丢失
function pushToCloud(key) {
  const docId = CLOUD_DOC_MAP[key];
  if (!docId) return Promise.resolve();
  const value = read(key, null);
  // 本地为空时，先检查云端是否已有数据，避免空数据覆盖云端
  if (isEmptyData(value)) {
    return getDb().collection(CLOUD_COLLECTION).doc(docId).get()
      .then(res => {
        // 云端已有数据则跳过推送，保留云端数据
        if (res.data && res.data.data !== undefined && !isEmptyData(res.data.data)) {
          return;
        }
        // 云端也为空，正常推送
        return getDb().collection(CLOUD_COLLECTION).doc(docId).set({
          data: { data: value }
        });
      })
      .catch(() => {
        // 读取云端失败，保守跳过推送，避免覆盖
      });
  }
  return getDb().collection(CLOUD_COLLECTION).doc(docId).set({
    data: { data: value }
  }).catch(err => {
    console.error('云同步失败', key, err);
  });
}

// 从云数据库拉取所有数据到本地缓存（联网时拉取云端权威数据）
function syncFromCloud() {
  if (!wx.cloud) return Promise.resolve();
  if (!networkAvailable) {
    // 断网：跳过拉取，保留本地缓存作为降级展示
    return Promise.resolve();
  }
  const tasks = Object.keys(CLOUD_DOC_MAP).map(key => pullFromCloud(key));
  return Promise.all(tasks).then(() => {
    cloudReady = true;
  });
}

// 将本地所有数据推送到云数据库
function syncToCloud() {
  if (!wx.cloud) return Promise.resolve();
  if (!networkAvailable) return Promise.resolve();
  const tasks = Object.keys(CLOUD_DOC_MAP).map(key => pushToCloud(key));
  return Promise.all(tasks);
}

// 初始化网络状态监听：断网时展示本地缓存，恢复联网时自动拉取云端权威数据
function initNetworkListener() {
  if (!wx.getNetworkType || !wx.onNetworkStatusChange) return;
  wx.getNetworkType({
    success: (res) => {
      networkAvailable = res.networkType !== 'none';
      if (networkAvailable) {
        syncFromCloud();
      }
    }
  });
  wx.onNetworkStatusChange((res) => {
    const wasOffline = !networkAvailable;
    networkAvailable = res.isConnected;
    if (res.isConnected && wasOffline) {
      // 恢复联网：拉取云端权威数据覆盖本地
      syncFromCloud();
    }
  });
}

function readLocal(key, fallback) {
  try {
    const val = wx.getStorageSync(key);
    return val === '' || val === undefined || val === null ? fallback : val;
  } catch (e) {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.error('存储失败', key, e);
  }
}

function read(key, fallback) {
  const stored = readLocal(key, undefined);
  if (stored === undefined || stored === null || stored === '') {
    return fallback;
  }
  // 解密存储内容（兼容旧明文数据）
  const decrypted = crypto.decrypt(stored);
  if (typeof decrypted === 'string') {
    try {
      return JSON.parse(decrypted);
    } catch (e) {
      // 解密结果不是 JSON（可能是旧明文对象或损坏数据），原样返回
      return decrypted;
    }
  }
  return decrypted;
}

function write(key, value) {
  // 加密后写入本地缓存
  writeLocal(key, crypto.encrypt(value));
  // 异步推送到云数据库（不阻塞页面）；断网时仅写本地，联网后自动补推
  if (cloudReady && wx.cloud && networkAvailable) {
    pushToCloud(key);
  }
}

// 资产构成分类定义
// 流动资产（原个人资产）
const PERSONAL_ASSET_CATEGORIES = [
  { key: 'deposit', name: '存款', icon: '🏦' },
  { key: 'stock', name: '股票', icon: '📈' },
  { key: 'fund', name: '基金', icon: '📊' },
  { key: 'bond', name: '债券', icon: '📜' }
];

// 非流动资产（原家庭资产）
const FAMILY_ASSET_CATEGORIES = [
  { key: 'house', name: '房产', icon: '🏠' },
  { key: 'car', name: '车', icon: '🚗' },
  { key: 'pension', name: '年金', icon: '💰' },
  { key: 'housingFund', name: '公积金', icon: '🏠' },
  { key: 'otherReceivable', name: '其他应收款', icon: '📋' }
];

// 预设头像（个人资产/成员头像），含汪汪队角色
// image 为本地图片路径（图片文件放在 assets/avatars/ 目录，稍后补充）
const PRESET_AVATARS = [
  { key: 'sky', name: '天天', icon: '🐶', image: '/assets/avatars/sky.png', color: '#FF8C42' },
  { key: 'chase', name: '阿奇', icon: '🐕', image: '/assets/avatars/chase.png', color: '#2196F3' },
  { key: 'marshall', name: '毛毛', icon: '🐕‍🦺', image: '/assets/avatars/marshall.png', color: '#F44336' },
  { key: 'rubble', name: '小砾', icon: '🐾', image: '/assets/avatars/rubble.png', color: '#FFA500' },
  { key: 'rocky', name: '灰灰', icon: '🦴', image: '/assets/avatars/rocky.png', color: '#4CAF50' },
  { key: 'everest', name: '珠珠', icon: '❄️', image: '/assets/avatars/everest.png', color: '#9C27B0' }
];

// 默认分类（收入/支出）
const DEFAULT_CATEGORIES = [
  // 收入类
  { id: 'cat_income_read', name: '看书', type: 'income', icon: '📖', color: '#07C160', isDefault: true },
  { id: 'cat_income_sleep', name: '睡觉', type: 'income', icon: '😴', color: '#66BB6A', isDefault: true },
  { id: 'cat_income_barber', name: '理发', type: 'income', icon: '💇', color: '#42A5F5', isDefault: true },
  { id: 'cat_income_salary', name: '工资', type: 'income', icon: '💰', color: '#07C160', isDefault: true },
  { id: 'cat_income_property', name: '财产收入', type: 'income', icon: '🏠', color: '#07C160', isDefault: true },
  // 支出类
  { id: 'cat_expense_shopping', name: '购物', type: 'expense', icon: '🛍️', color: '#FF8A65', isDefault: true },
  { id: 'cat_expense_travel', name: '旅游', type: 'expense', icon: '✈️', color: '#42A5F5', isDefault: true },
  { id: 'cat_expense_property', name: '财产支出', type: 'expense', icon: '🏠', color: '#FF8A65', isDefault: true },
  { id: 'cat_expense_other', name: '其它', type: 'expense', icon: '📦', color: '#90A4AE', isDefault: true }
];

// 默认资产分类（流动资产 + 非流动资产）
// 资产分类使用 key 作为唯一标识（资产记录通过 category 字段引用 key）
const DEFAULT_ASSET_CATEGORIES = [
  // 流动资产
  { key: 'deposit', name: '存款', type: 'asset_personal', icon: '🏦', color: '#07C160', isDefault: true },
  { key: 'stock', name: '股票', type: 'asset_personal', icon: '📈', color: '#EF5350', isDefault: true },
  { key: 'fund', name: '基金', type: 'asset_personal', icon: '📊', color: '#42A5F5', isDefault: true },
  { key: 'bond', name: '债券', type: 'asset_personal', icon: '📜', color: '#9575CD', isDefault: true },
  // 非流动资产
  { key: 'house', name: '房产', type: 'asset_family', icon: '🏠', color: '#FF8A65', isDefault: true },
  { key: 'car', name: '车', type: 'asset_family', icon: '🚗', color: '#42A5F5', isDefault: true },
  { key: 'pension', name: '年金', type: 'asset_family', icon: '💰', color: '#FFCA28', isDefault: true },
  { key: 'housingFund', name: '公积金', type: 'asset_family', icon: '🏠', color: '#4DB6AC', isDefault: true },
  { key: 'otherReceivable', name: '其他应收款', type: 'asset_family', icon: '📋', color: '#8D6E63', isDefault: true }
];

// 默认负债分类（房贷、车贷）
const DEFAULT_LIABILITY_CATEGORIES = [
  { id: 'cat_liability_mortgage', name: '房贷', type: 'liability', icon: '🏠', color: '#FF7043', isDefault: true },
  { id: 'cat_liability_carloan', name: '车贷', type: 'liability', icon: '🚗', color: '#FFA726', isDefault: true }
];

// 初始化：先从云数据库拉取最新数据，再写入默认分类和默认成员
// 返回 Promise，便于调用方在数据同步完成后执行后续逻辑（如自动入账）
function init() {
  // 初始化网络状态监听（断网降级 / 联网自动拉云端权威数据）
  initNetworkListener();
  // 先从云数据库拉取最新数据到本地缓存
  return syncFromCloud().then(() => {
    const cats = read(KEYS.CATEGORIES, null);
    if (!cats) {
      write(KEYS.CATEGORIES, DEFAULT_CATEGORIES.map(c => Object.assign({}, c)));
    } else {
      // 检测旧版默认分类（含旧分类名），重置为新分类
      const oldNames = ['餐饮', '交通', '居家', '娱乐', '医疗', '奖金', '理财', '其他收入', '其他支出'];
      const hasOld = cats.some(c => oldNames.indexOf(c.name) > -1);
      if (hasOld) {
        write(KEYS.CATEGORIES, DEFAULT_CATEGORIES.map(c => Object.assign({}, c)));
      }
    }
    const members = read(KEYS.MEMBERS, null);
    if (!members) {
      write(KEYS.MEMBERS, [{ id: genId('mem'), name: '我', avatar: '#07C160', avatarIcon: 'default', createdAt: Date.now() }]);
    }
    const records = read(KEYS.RECORDS, null);
    if (!records) {
      write(KEYS.RECORDS, []);
    }
    const anchors = read(KEYS.ANCHORS, null);
    if (!anchors) {
      write(KEYS.ANCHORS, []);
    }
    const assets = read(KEYS.ASSETS, null);
    if (!assets) {
      write(KEYS.ASSETS, []);
    }
    const assetRecords = read(KEYS.ASSET_RECORDS, null);
    if (!assetRecords) {
      write(KEYS.ASSET_RECORDS, []);
    }
    const goals = read(KEYS.GOALS, null);
    if (!goals) {
      write(KEYS.GOALS, []);
    }
    // 数据迁移：年金从流动资产（个人）汇合到非流动资产（家庭）
    migratePension();
    // 数据迁移：公积金从流动资产（个人）归入非流动资产（家庭）
    migrateHousingFund();
    // 数据迁移：清理公积金资产变动记录（公积金入账只更新资产余额，不出现在最近记录/新增统计）
    migrateHousingFundAssetRecords();
    // 数据迁移：补充默认资产分类
    migrateAssetCategories();
    // 数据迁移：补充默认负债分类
    migrateLiabilityCategories();
    // 首次启动后把默认数据推送到云数据库
    syncToCloud();
  });
}

// 将默认资产分类补充到分类存储中（幂等，缺失的默认分类才补充）
function migrateAssetCategories() {
  const cats = getCategories();
  const defaults = DEFAULT_ASSET_CATEGORIES.map(c => Object.assign({}, c, { id: genId('cat') }));
  const missing = defaults.filter(d => !cats.some(c => c.key === d.key));
  if (missing.length === 0) return;
  write(KEYS.CATEGORIES, cats.concat(missing));
}

// 将默认负债分类补充到分类存储中（幂等，缺失的默认分类才补充）
function migrateLiabilityCategories() {
  const cats = getCategories();
  const missing = DEFAULT_LIABILITY_CATEGORIES.filter(d => !cats.some(c => c.id === d.id));
  if (missing.length === 0) return;
  write(KEYS.CATEGORIES, cats.concat(missing.map(c => Object.assign({}, c))));
}

// 将各成员的年金加总汇合到家庭年金（非流动资产）下
function migratePension() {
  const assets = getAssets();
  const personalPensions = assets.filter(a => a.scope === 'personal' && a.category === 'pension');
  if (personalPensions.length === 0) return;
  let pensionTotal = 0;
  personalPensions.forEach(a => { pensionTotal += a.amount; });
  const remaining = assets.filter(a => !(a.scope === 'personal' && a.category === 'pension'));
  const familyIdx = remaining.findIndex(a => a.scope === 'family' && a.category === 'pension');
  if (familyIdx > -1) {
    remaining[familyIdx].amount = Math.round((remaining[familyIdx].amount + pensionTotal) * 100) / 100;
    remaining[familyIdx].updatedAt = Date.now();
  } else {
    remaining.push({
      id: genId('ast'),
      scope: 'family',
      memberId: '',
      category: 'pension',
      categoryName: '年金',
      icon: '💰',
      amount: Math.round(pensionTotal * 100) / 100,
      updatedAt: Date.now()
    });
  }
  saveAssets(remaining);
}

// 将公积金从流动资产（个人）归入非流动资产（家庭）
// 1. 分类 type 由 asset_personal 改为 asset_family
// 2. 各成员公积金资产记录合并到家庭公积金（scope: family）
function migrateHousingFund() {
  // 1. 更新分类类型
  const cats = getCategories();
  let catChanged = false;
  const newCats = cats.map(c => {
    if (c.key === 'housingFund' && c.type === 'asset_personal') {
      catChanged = true;
      return Object.assign({}, c, { type: 'asset_family' });
    }
    return c;
  });
  if (catChanged) saveCategories(newCats);

  // 2. 合并个人公积金资产记录到家庭公积金
  const assets = getAssets();
  const personalHousing = assets.filter(a => a.scope === 'personal' && a.category === 'housingFund');
  if (personalHousing.length === 0) return;
  let housingTotal = 0;
  personalHousing.forEach(a => { housingTotal += a.amount; });
  const remaining = assets.filter(a => !(a.scope === 'personal' && a.category === 'housingFund'));
  const familyIdx = remaining.findIndex(a => a.scope === 'family' && a.category === 'housingFund');
  if (familyIdx > -1) {
    remaining[familyIdx].amount = Math.round((remaining[familyIdx].amount + housingTotal) * 100) / 100;
    remaining[familyIdx].updatedAt = Date.now();
  } else {
    remaining.push({
      id: genId('ast'),
      scope: 'family',
      memberId: '',
      category: 'housingFund',
      categoryName: '公积金',
      icon: '🏠',
      amount: Math.round(housingTotal * 100) / 100,
      updatedAt: Date.now()
    });
  }
  saveAssets(remaining);
}

// 清理历史资产变动记录（仅执行一次）
// 历史遗留的资产变动记录存的是「资产当前值」而非「变动额」，口径与新记录不一致，
// 会污染「最近记录」与「本年/本月新增」统计（导致新增被严重高估）。
// 用标志位保证只清理一次，之后新产生的资产变动记录（存变动额，含流动资产/非流动资产）正常参与统计。
function migrateHousingFundAssetRecords() {
  // 迁移标志位存独立本地 key（不参与云同步），避免被云端 settings 覆盖导致重复清空资产变动记录
  const flags = read(KEYS.MIGRATION_FLAGS, {});
  if (flags.assetRecordsMigrated) return;
  // 兼容旧版本：若旧标志位（存于 settings）已置位，说明此前已迁移过，直接沿用，避免二次清空
  const oldSettings = read(KEYS.SETTINGS, {});
  if (oldSettings.assetRecordsMigrated) {
    flags.assetRecordsMigrated = true;
    write(KEYS.MIGRATION_FLAGS, flags);
    return;
  }
  const records = getAssetRecords();
  if (records.length > 0) {
    saveAssetRecords([]);
  }
  flags.assetRecordsMigrated = true;
  write(KEYS.MIGRATION_FLAGS, flags);
}

// ============ 成员 ============
// 根据头像 key 解析出对应的 emoji 图标
function resolveAvatarIcon(key) {
  const preset = PRESET_AVATARS.find(a => a.key === key);
  return preset ? preset.icon : '';
}

// 根据头像 key 解析出对应的本地图片路径
function resolveAvatarImage(key) {
  const preset = PRESET_AVATARS.find(a => a.key === key);
  return preset ? preset.image : '';
}

function getMembers() {
  return read(KEYS.MEMBERS, []).map(m => Object.assign({}, m, {
    avatarIconEmoji: resolveAvatarIcon(m.avatarIcon),
    avatarImage: resolveAvatarImage(m.avatarIcon)
  }));
}

function saveMembers(members) {
  write(KEYS.MEMBERS, members);
}

function addMember(name, avatar, avatarIcon) {
  const members = getMembers();
  const member = {
    id: genId('mem'),
    name: name || '未命名',
    avatar: avatar || '#07C160',
    avatarIcon: avatarIcon || '',
    createdAt: Date.now()
  };
  members.push(member);
  saveMembers(members);
  return member;
}

function updateMember(id, data) {
  const members = getMembers();
  const idx = members.findIndex(m => m.id === id);
  if (idx > -1) {
    members[idx] = Object.assign({}, members[idx], data);
    saveMembers(members);
  }
}

function deleteMember(id) {
  const members = getMembers().filter(m => m.id !== id);
  saveMembers(members);
  // 同时删除该成员的记录
  const records = getRecords().filter(r => r.memberId !== id);
  saveRecords(records);
  // 同时删除该成员的资产锚点
  const anchors = getAnchors().filter(a => a.memberId !== id);
  saveAnchors(anchors);
  // 同时删除该成员的个人资产构成
  const assets = getAssets().filter(a => !(a.scope === 'personal' && a.memberId === id));
  saveAssets(assets);
}

// 所有成员每月公积金缴纳额之和（单位：元）
function getMemberHousingFundTotal() {
  return getMembers().reduce((sum, m) => sum + (parseFloat(m.housingFund) || 0), 0);
}

// 所有成员每月财产收入之和（单位：元）
function getMemberPropertyIncomeTotal() {
  return getMembers().reduce((sum, m) => sum + (parseFloat(m.propertyIncome) || 0), 0);
}

// 所有成员每月财产支出之和（单位：元）
function getMemberPropertyExpenseTotal() {
  return getMembers().reduce((sum, m) => sum + (parseFloat(m.propertyExpense) || 0), 0);
}

// 生成从 fromMonth（不含）到 toMonth（含）的所有月份，格式 YYYY-MM
// fromMonth 为空时仅返回 toMonth（从未入账过则只入账当前月份，避免补记过多历史）
function monthsBetween(fromMonth, toMonth) {
  if (!fromMonth) return [toMonth];
  const result = [];
  let y = Number(fromMonth.slice(0, 4));
  let m = Number(fromMonth.slice(5, 7));
  const ty = Number(toMonth.slice(0, 4));
  const tm = Number(toMonth.slice(5, 7));
  // 从 fromMonth 的下一个月开始
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  while (y < ty || (y === ty && m <= tm)) {
    result.push(y + '-' + (m < 10 ? '0' + m : '' + m));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}

// 返回某月份（YYYY-MM）的上一个月
function prevMonthStr(month) {
  let y = Number(month.slice(0, 4));
  let m = Number(month.slice(5, 7));
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' + m : '' + m);
}

// 每月15日自动入账：将各成员公积金缴纳额之和计入非流动资产（公积金）
// 若15日当天未打开，之后任意一天打开都会补记当月及之前所有未入账的月份
// 返回本次入账总金额；若未到15日或本月已入账则返回 0
function autoCreditHousingFund() {
  const today = dateUtil.today(); // 形如 2026-08-27
  const day = parseInt(today.split('-')[2], 10);
  const currentMonth = today.slice(0, 7); // 2026-08
  // 当前月份若未到15号，则当前月份不入账，最多补记到上个月
  const lastCreditMonthForRange = day < 15 ? prevMonthStr(currentMonth) : currentMonth;

  const settings = read(KEYS.SETTINGS, {});
  const lastDone = settings.housingFundCreditMonth || '';
  // 需要补记的月份：从上次入账月份的下一个月到 lastCreditMonthForRange
  const months = monthsBetween(lastDone, lastCreditMonthForRange);
  if (months.length === 0) return 0;

  const total = getMemberHousingFundTotal();
  if (total <= 0) return 0;

  // 累加 total * 补记月数 到家庭公积金资产
  const assets = getAssets();
  const idx = assets.findIndex(a => a.scope === 'family' && a.category === 'housingFund');
  const cat = getAssetCategories('family').find(c => c.key === 'housingFund');
  const creditTotal = Math.round(total * months.length * 100) / 100;
  if (idx > -1) {
    assets[idx].amount = Math.round((assets[idx].amount + creditTotal) * 100) / 100;
    assets[idx].updatedAt = Date.now();
  } else {
    assets.push({
      id: genId('ast'),
      scope: 'family',
      memberId: '',
      category: 'housingFund',
      categoryName: cat ? cat.name : '公积金',
      icon: cat ? cat.icon : '🏠',
      amount: creditTotal,
      updatedAt: Date.now()
    });
  }
  saveAssets(assets);

  // 标记已入账到 lastCreditMonthForRange
  settings.housingFundCreditMonth = lastCreditMonthForRange;
  write(KEYS.SETTINGS, settings);

  return creditTotal;
}

// 每月15日自动入账财产收入/支出：只要有值就为各成员记录一笔收入或支出
// 若15日当天未打开，之后任意一天打开都会补记当月及之前所有未入账的月份
// 返回本次净入账金额（收入-支出）；若未到15日或本月已入账则返回 0
function autoCreditPropertyIncome() {
  const today = dateUtil.today(); // 形如 2026-08-27
  const day = parseInt(today.split('-')[2], 10);
  const currentMonth = today.slice(0, 7); // 2026-08
  // 当前月份若未到15号，则当前月份不入账，最多补记到上个月
  const lastCreditMonthForRange = day < 15 ? prevMonthStr(currentMonth) : currentMonth;

  const settings = read(KEYS.SETTINGS, {});
  const lastDone = settings.propertyIncomeCreditMonth || '';
  // 需要补记的月份：从上次入账月份的下一个月到 lastCreditMonthForRange
  const months = monthsBetween(lastDone, lastCreditMonthForRange);
  if (months.length === 0) return 0;

  const members = getMembers();
  let total = 0;
  // 每个补记月份为各成员记录一笔收入/支出（日期取该月15日）
  months.forEach(m => {
    members.forEach(member => {
      const income = parseFloat(member.propertyIncome) || 0;
      const expense = parseFloat(member.propertyExpense) || 0;
      // 财产收入：有值则记录一笔收入
      if (income > 0) {
        addRecord({
          memberId: member.id,
          type: 'income',
          amount: Math.round(income * 100) / 100,
          categoryId: 'cat_income_property',
          date: m + '-15',
          remark: '财产收入（自动入账）'
        });
        total += income;
      }
      // 财产支出：有值则记录一笔支出
      if (expense > 0) {
        addRecord({
          memberId: member.id,
          type: 'expense',
          amount: Math.round(expense * 100) / 100,
          categoryId: 'cat_expense_property',
          date: m + '-15',
          remark: '财产支出（自动入账）'
        });
        total -= expense;
      }
    });
  });
  if (total === 0) return 0;

  // 标记已入账到 lastCreditMonthForRange
  settings.propertyIncomeCreditMonth = lastCreditMonthForRange;
  write(KEYS.SETTINGS, settings);

  return total;
}

// ============ 记录 ============
function getRecords() {
  return read(KEYS.RECORDS, []);
}

function saveRecords(records) {
  write(KEYS.RECORDS, records);
}

function addRecord(data) {
  const records = getRecords();
  const record = Object.assign({
    id: genId('rec'),
    memberId: '',
    type: 'expense',
    amount: 0,
    categoryId: '',
    date: '',
    imagePath: '',
    remark: '',
    createdAt: Date.now()
  }, data);
  records.push(record);
  saveRecords(records);
  return record;
}

function updateRecord(id, data) {
  const records = getRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx > -1) {
    records[idx] = Object.assign({}, records[idx], data);
    saveRecords(records);
  }
}

function deleteRecord(id) {
  const records = getRecords().filter(r => r.id !== id);
  saveRecords(records);
}

// ============ 分类 ============
function getCategories() {
  return read(KEYS.CATEGORIES, []);
}

function saveCategories(categories) {
  write(KEYS.CATEGORIES, categories);
}

function addCategory(data) {
  const cats = getCategories();
  const cat = Object.assign({
    id: genId('cat'),
    name: '',
    type: 'expense',
    icon: '📌',
    color: '#90A4AE',
    isDefault: false
  }, data);
  cats.push(cat);
  saveCategories(cats);
  return cat;
}

function updateCategory(id, data) {
  const cats = getCategories();
  const idx = cats.findIndex(c => c.id === id);
  if (idx > -1) {
    cats[idx] = Object.assign({}, cats[idx], data);
    saveCategories(cats);
  }
}

function deleteCategory(id) {
  const cats = getCategories().filter(c => c.id !== id);
  saveCategories(cats);
}

// ============ 资产锚点（期初资产 / 快照） ============
function getAnchors() {
  return read(KEYS.ANCHORS, []);
}

function saveAnchors(anchors) {
  write(KEYS.ANCHORS, anchors);
}

// 获取某成员的所有锚点，按日期排序（旧到新）
function getMemberAnchors(memberId) {
  return getAnchors()
    .filter(a => a.memberId === memberId)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 新增锚点：type 为 'initial'（期初）或 'snapshot'（快照）
function addAnchor(data) {
  const anchors = getAnchors();
  const anchor = Object.assign({
    id: genId('anc'),
    memberId: '',
    type: 'snapshot',
    date: '',
    amount: 0,
    note: '',
    createdAt: Date.now()
  }, data);
  anchors.push(anchor);
  saveAnchors(anchors);
  return anchor;
}

function updateAnchor(id, data) {
  const anchors = getAnchors();
  const idx = anchors.findIndex(a => a.id === id);
  if (idx > -1) {
    anchors[idx] = Object.assign({}, anchors[idx], data);
    saveAnchors(anchors);
  }
}

function deleteAnchor(id) {
  const anchors = getAnchors().filter(a => a.id !== id);
  saveAnchors(anchors);
}

// 获取某成员的期初资产锚点（若有多个取最早）
function getInitialAnchor(memberId) {
  const initials = getAnchors().filter(a => a.memberId === memberId && a.type === 'initial');
  if (initials.length === 0) return null;
  initials.sort((a, b) => (a.date < b.date ? -1 : 1));
  return initials[0];
}

// ============ 资产构成（个人资产 + 家庭资产） ============
// 资产构成项结构：
// { id, scope: 'personal'|'family', memberId, category, categoryName, icon, amount, updatedAt }
function getAssets() {
  return read(KEYS.ASSETS, []);
}

function saveAssets(assets) {
  write(KEYS.ASSETS, assets);
}

// 获取某 scope 的资产分类列表（按存储顺序）
// scope: 'personal'（流动资产）| 'family'（非流动资产）
// 返回 [{ key, name, icon, color }]
function getAssetCategories(scope) {
  const type = scope === 'family' ? 'asset_family' : 'asset_personal';
  return getCategories()
    .filter(c => c.type === type)
    .map(c => ({ key: c.key || c.id, name: c.name, icon: c.icon, color: c.color }));
}

// 获取某成员的个人资产构成项（按分类定义顺序）
function getPersonalAssets(memberId) {
  const assets = getAssets().filter(a => a.scope === 'personal' && a.memberId === memberId);
  return getAssetCategories('personal').map(cat => {
    const found = assets.find(a => a.category === cat.key);
    return {
      category: cat.key,
      categoryName: cat.name,
      icon: cat.icon,
      amount: found ? found.amount : 0
    };
  });
}

// 获取家庭资产构成项（按分类定义顺序；非流动资产可绑定成员，按分类汇总所有成员）
function getFamilyAssets() {
  const assets = getAssets().filter(a => a.scope === 'family');
  return getAssetCategories('family').map(cat => {
    const found = assets.filter(a => a.category === cat.key);
    const amount = found.reduce((s, a) => s + a.amount, 0);
    return {
      category: cat.key,
      categoryName: cat.name,
      icon: cat.icon,
      amount: Math.round(amount * 100) / 100
    };
  });
}

// 设置某构成项金额（不存在则新增），并记录资产变动
// date 为变动日期（默认今天）
// 资产变动记录 amount 存「变动额」（新值 - 旧值），用于最近记录展示与新增统计
function setAssetAmount(scope, memberId, category, amount, date, recordChange) {
  const assets = getAssets();
  const idx = assets.findIndex(a =>
    a.scope === scope && a.memberId === (memberId || '') && a.category === category
  );
  const oldAmount = idx > -1 ? assets[idx].amount : 0;
  const newAmount = Math.round((amount || 0) * 100) / 100;
  const change = Math.round((newAmount - oldAmount) * 100) / 100;
  const data = {
    scope,
    memberId: memberId || '',
    category,
    amount: newAmount,
    updatedAt: Date.now()
  };
  let cat;
  if (idx > -1) {
    assets[idx] = Object.assign({}, assets[idx], data);
    cat = getAssetCategories(scope).find(c => c.key === category);
  } else {
    cat = getAssetCategories(scope).find(c => c.key === category);
    assets.push(Object.assign({
      id: genId('ast'),
      categoryName: cat ? cat.name : category,
      icon: cat ? cat.icon : '📦'
    }, data));
  }
  saveAssets(assets);
  // 记录资产变动（用于按日展示）；资产构成编辑（recordChange === false）不记录
  if (recordChange !== false && change !== 0) {
    addAssetRecord({
      scope,
      memberId: memberId || '',
      category,
      categoryName: cat ? cat.name : category,
      icon: cat ? cat.icon : '📦',
      amount: change,
      date: date || dateUtil.today()
    });
  }
}

// ============ 资产变动记录 ============
// 资产变动记录结构：
// { id, scope: 'personal'|'family', memberId, category, categoryName, icon, amount, date, createdAt }
function getAssetRecords() {
  return read(KEYS.ASSET_RECORDS, []);
}

function saveAssetRecords(records) {
  write(KEYS.ASSET_RECORDS, records);
}

function addAssetRecord(data) {
  const records = getAssetRecords();
  const record = Object.assign({
    id: genId('astrec'),
    scope: 'personal',
    memberId: '',
    category: '',
    categoryName: '',
    icon: '📦',
    amount: 0,
    date: dateUtil.today(),
    createdAt: Date.now()
  }, data);
  records.push(record);
  saveAssetRecords(records);
  return record;
}

function updateAssetRecord(id, data) {
  const records = getAssetRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx > -1) {
    records[idx] = Object.assign({}, records[idx], data);
    saveAssetRecords(records);
  }
}

function deleteAssetRecord(id) {
  saveAssetRecords(getAssetRecords().filter(r => r.id !== id));
}

// 编辑资产记录：回退旧资产金额并删除旧记录，再按新数据设置资产金额
// data: { scope, memberId, category, amount, date }
function updateAssetRecordWithAmount(id, data) {
  const oldRec = getAssetRecords().find(r => r.id === id);
  if (!oldRec) return;
  // 回退旧资产金额
  const assets = getAssets();
  const oldIdx = assets.findIndex(a =>
    a.scope === oldRec.scope && a.memberId === (oldRec.memberId || '') && a.category === oldRec.category
  );
  if (oldIdx > -1) {
    assets[oldIdx].amount = Math.round((assets[oldIdx].amount - oldRec.amount) * 100) / 100;
    assets[oldIdx].updatedAt = Date.now();
  }
  saveAssets(assets);
  // 删除旧资产记录
  saveAssetRecords(getAssetRecords().filter(r => r.id !== id));
  // 设置新资产金额（会新增资产变动记录）
  setAssetAmount(data.scope, data.memberId, data.category, data.amount, data.date);
}

// 删除资产记录并回退对应资产金额
function deleteAssetRecordWithAmount(id) {
  const oldRec = getAssetRecords().find(r => r.id === id);
  if (!oldRec) return;
  // 回退资产金额
  const assets = getAssets();
  const idx = assets.findIndex(a =>
    a.scope === oldRec.scope && a.memberId === (oldRec.memberId || '') && a.category === oldRec.category
  );
  if (idx > -1) {
    assets[idx].amount = Math.round((assets[idx].amount - oldRec.amount) * 100) / 100;
    assets[idx].updatedAt = Date.now();
  }
  saveAssets(assets);
  // 删除资产记录
  saveAssetRecords(getAssetRecords().filter(r => r.id !== id));
}

// 某成员个人资产总额
function personalAssetTotal(memberId) {
  return getPersonalAssets(memberId).reduce((s, a) => s + a.amount, 0);
}

// 家庭资产总额
function familyAssetTotal() {
  return getFamilyAssets().reduce((s, a) => s + a.amount, 0);
}

// 所有成员个人资产总额
function allPersonalAssetTotal() {
  const members = getMembers();
  let total = 0;
  members.forEach(m => { total += personalAssetTotal(m.id); });
  return total;
}

// 负债总额 = 所有负债记录之和
function liabilityTotal() {
  let total = 0;
  getRecords().forEach(r => {
    if (r.type === 'liability') total += r.amount;
  });
  return total;
}

// 总资产（个人资产 + 家庭资产 - 负债）
function totalAssets() {
  return allPersonalAssetTotal() + familyAssetTotal() - liabilityTotal();
}

// 流动资产 = 各成员流动资产之和 = 资产构成之和 + 收入 - 支出
function currentAssetTotal() {
  let income = 0;
  let expense = 0;
  getRecords().forEach(r => {
    if (r.type === 'income') income += r.amount;
    else if (r.type === 'expense') expense += r.amount;
  });
  return allPersonalAssetTotal() + income - expense;
}

// 家庭总资产 = 流动资产 + 非流动资产 - 负债
function familyTotalAsset() {
  return currentAssetTotal() + familyAssetTotal() - liabilityTotal();
}

// 获取预设头像列表
function getPresetAvatars() {
  return PRESET_AVATARS;
}

// ============ 资产计算引擎 ============
// 获取某成员的所有资产事件（锚点 + 收支），按日期排序
// 返回 [{ date, kind: 'anchor'|'income'|'expense', amount, anchorType }]
function getMemberEvents(memberId) {
  const events = [];
  getMemberAnchors(memberId).forEach(a => {
    events.push({ date: a.date, kind: 'anchor', amount: a.amount, anchorType: a.type, anchorId: a.id });
  });
  getRecords().forEach(r => {
    if (r.memberId !== memberId) return;
    events.push({ date: r.date, kind: r.type, amount: r.amount });
  });
  events.sort((a, b) => (a.date < b.date ? -1 : 1));
  return events;
}

// 计算某成员在指定日期（含）的资产
// 个人资产 = 资产构成之和 - 个人支出 + 个人收入
function memberBalanceAt(memberId, date) {
  const assetTotal = personalAssetTotal(memberId);
  let income = 0;
  let expense = 0;
  getRecords().forEach(r => {
    if (r.memberId !== memberId) return;
    if (r.date > date) return;
    if (r.type === 'income') income += r.amount;
    else if (r.type === 'expense') expense += r.amount;
  });
  return assetTotal + income - expense;
}

// 计算某成员当前资产（截至今天）
function memberBalance(memberId) {
  return memberBalanceAt(memberId, dateUtil.today());
}

// 家庭总资产（所有成员当前资产之和）
function familyBalance() {
  const members = getMembers();
  let balance = 0;
  members.forEach(m => {
    balance += memberBalance(m.id);
  });
  return balance;
}

// 按日期聚合某成员资产趋势，dates 为日期数组（旧到新）
function memberBalanceTrend(memberId, dates) {
  return dates.map(d => memberBalanceAt(memberId, d));
}

// 按日期聚合家庭总资产趋势，dates 为日期数组（旧到新）
function balanceTrend(dates) {
  const members = getMembers();
  const result = [];
  dates.forEach(d => {
    let total = 0;
    members.forEach(m => {
      total += memberBalanceAt(m.id, d);
    });
    result.push(total);
  });
  return result;
}

// 获取某成员资产时间线（用于个人资产详情页）
// 返回 { points: [{date, balance}], anchors: [{date, type, amount, note}], initial, current, change }
function memberAssetTimeline(memberId, dates) {
  const anchors = getMemberAnchors(memberId);
  const points = dates.map(d => ({ date: d, balance: memberBalanceAt(memberId, d) }));
  const current = memberBalance(memberId);
  const initial = anchors.length > 0 ? anchors[0].amount : 0;
  return {
    points,
    anchors,
    initial,
    current,
    change: current - initial
  };
}

// ============ 统计聚合 ============
// 计算某成员资产（资产构成之和 - 个人支出 + 个人收入）
function memberBalance(memberId) {
  const assetTotal = personalAssetTotal(memberId);
  const records = getRecords().filter(r => r.memberId === memberId);
  let balance = 0;
  records.forEach(r => {
    balance += r.type === 'income' ? r.amount : -r.amount;
  });
  return assetTotal + balance;
}

// 家庭总资产
function familyBalance() {
  const records = getRecords();
  let balance = 0;
  records.forEach(r => {
    balance += r.type === 'income' ? r.amount : -r.amount;
  });
  return balance;
}

// 按分类统计（某类型，可选成员、日期范围）
function categoryStats(type, memberId, startDate, endDate) {
  const records = getRecords().filter(r => {
    if (r.type !== type) return false;
    if (memberId && r.memberId !== memberId) return false;
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
  const cats = getCategories();
  const map = {};
  records.forEach(r => {
    const cat = cats.find(c => c.id === r.categoryId);
    const key = cat ? cat.name : '未分类';
    if (!map[key]) {
      map[key] = { name: key, amount: 0, count: 0, color: cat ? cat.color : '#999999', icon: cat ? cat.icon : '❓' };
    }
    map[key].amount += r.amount;
    map[key].count++;
  });
  return Object.keys(map).map(k => map[k]).sort((a, b) => b.amount - a.amount);
}

// 按成员统计（可选日期范围）
// balance 为成员当前资产（含期初/快照锚点），income/expense 为指定日期范围内的收支
function memberStats(startDate, endDate) {
  const members = getMembers();
  const records = getRecords().filter(r => {
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
  return members.map(m => {
    let income = 0;
    let expense = 0;
    records.forEach(r => {
      if (r.memberId !== m.id) return;
      if (r.type === 'income') income += r.amount;
      else if (r.type === 'expense') expense += r.amount;
    });
    return {
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      avatarIcon: m.avatarIcon || '',
      avatarIconEmoji: resolveAvatarIcon(m.avatarIcon),
      avatarImage: resolveAvatarImage(m.avatarIcon),
      income,
      expense,
      balance: memberBalance(m.id)
    };
  });
}

// ============ 财务目标 ============
// 目标结构：{ id, name, type, memberId, targetAmount, currentAmount, deadline, icon, color, createdAt }
// type: 'family' | 'personal'；memberId 仅个人目标使用
function getGoals() {
  return read(KEYS.GOALS, []);
}

function saveGoals(goals) {
  write(KEYS.GOALS, goals);
}

function addGoal(data) {
  const goals = getGoals();
  const goal = Object.assign({
    id: genId('goal'),
    name: '未命名目标',
    type: 'family',
    memberId: '',
    targetAmount: 0,
    currentAmount: 0,
    deadline: '',
    icon: '🎯',
    color: '#07C160',
    createdAt: Date.now()
  }, data);
  goals.push(goal);
  saveGoals(goals);
  return goal;
}

function updateGoal(id, data) {
  const goals = getGoals();
  const idx = goals.findIndex(g => g.id === id);
  if (idx > -1) {
    goals[idx] = Object.assign({}, goals[idx], data);
    saveGoals(goals);
  }
}

function deleteGoal(id) {
  saveGoals(getGoals().filter(g => g.id !== id));
}

// 所有目标总金额
function goalTotal() {
  return getGoals().reduce((s, g) => s + (g.targetAmount || 0), 0);
}

// 所有目标当前已存金额
function goalCurrentTotal() {
  return getGoals().reduce((s, g) => s + (g.currentAmount || 0), 0);
}

// 家庭目标当前已存 = 流动资产 + 收入 - 支出
function familyGoalCurrentAmount() {
  const detail = familyGoalCurrentDetail();
  return detail.assetTotal + detail.income - detail.expense;
}

// 家庭目标当前已存明细（用于展示计算口径）
// 返回 { assetTotal, deposit, stock, fund, bond, income, expense }
function familyGoalCurrentDetail() {
  // 流动资产分类（公积金已归入非流动资产）
  const targetCats = ['deposit', 'stock', 'fund', 'bond'];
  const detail = { assetTotal: 0, deposit: 0, stock: 0, fund: 0, bond: 0, income: 0, expense: 0 };
  getMembers().forEach(m => {
    getPersonalAssets(m.id).forEach(a => {
      if (targetCats.indexOf(a.category) > -1) {
        detail.assetTotal += a.amount;
        if (detail[a.category] !== undefined) detail[a.category] += a.amount;
      }
    });
  });
  getRecords().forEach(r => {
    if (r.type === 'income') detail.income += r.amount;
    else if (r.type === 'expense') detail.expense += r.amount;
  });
  return detail;
}

// 获取目标当前已存金额
// 家庭目标 = 家庭存款+股票+基金+债券+收入-支出；个人目标 = 所选成员净资产
function goalCurrentAmount(goal) {
  if (!goal) return 0;
  if (goal.type === 'personal' && goal.memberId) {
    return memberBalanceAt(goal.memberId, dateUtil.today());
  }
  return familyGoalCurrentAmount();
}

// ============ 资产增长额 ============
// 家庭总资产在指定日期的值（基于锚点 + 收支）
function familyBalanceAt(date) {
  const members = getMembers();
  let total = 0;
  members.forEach(m => { total += memberBalanceAt(m.id, date); });
  return total;
}

// 某日期范围内的资产变动净额（资产变动记录 amount 之和）
function assetChangeInRange(startDate, endDate) {
  return getAssetRecords()
    .filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate))
    .reduce((s, r) => s + r.amount, 0);
}

// 本月新增 = 当前总资产 - 月初总资产 + 本月资产变动净额
// （familyBalanceAt 差值只反映本月收入-支出，资产变动记录需单独计入）
function monthGrowth() {
  const start = dateUtil.monthStart(new Date());
  const end = dateUtil.today();
  return familyBalanceAt(end) - familyBalanceAt(start) + assetChangeInRange(start, end);
}

// 年初至今新增 = 当前总资产 - 年初总资产 + 年初至今资产变动净额
function yearGrowth() {
  const yearStart = new Date().getFullYear() + '-01-01';
  const end = dateUtil.today();
  return familyBalanceAt(end) - familyBalanceAt(yearStart) + assetChangeInRange(yearStart, end);
}

// 某日期范围内「最近记录」所有明细之和（收入 + 资产变动 - 支出）
// 与总览TAB「最近记录」展示的明细一致：收入记录、支出记录、资产变动记录
function recordSumInRange(records, startDate, endDate) {
  let sum = 0;
  console.log('[recordSumInRange] 范围:', startDate, '~', endDate);
  records.forEach(r => {
    if (startDate && r.date < startDate) return;
    if (endDate && r.date > endDate) return;
    const sign = r.type === 'income' ? '+' : '-';
    console.log('[recordSumInRange] 收支记录:', r.date, r.type, r.amount, '=>', sign + r.amount, '| 成员:', r.memberId, '| 分类:', r.categoryId);
    if (r.type === 'income') sum += r.amount;
    else if (r.type === 'expense' || r.type === 'liability') sum -= r.amount;
    console.log('[recordSumInRange]   累计:', sum);
  });
  // 资产变动记录（流动资产 + 非流动资产）也计入
  getAssetRecords().forEach(r => {
    if (startDate && r.date < startDate) return;
    if (endDate && r.date > endDate) return;
    console.log('[recordSumInRange] 资产变动:', r.date, r.categoryName || r.category, r.amount, '| 成员:', r.memberId, '| scope:', r.scope);
    sum += r.amount;
    console.log('[recordSumInRange]   累计:', sum);
  });
  console.log('[recordSumInRange] 合计:', sum);
  return sum;
}

// 本月新增 = 本月所有记录之和（收入 + 资产变动 - 支出）
function monthRecordSum(records) {
  const start = dateUtil.monthStart(new Date());
  const end = dateUtil.today();
  return recordSumInRange(records, start, end);
}

// 本年新增 = 本年所有记录之和（收入 + 资产变动 - 支出）
function yearRecordSum(records) {
  const yearStart = new Date().getFullYear() + '-01-01';
  const end = dateUtil.today();
  return recordSumInRange(records, yearStart, end);
}

// ============ 设置 ============
// 金额隐藏开关（全局生效）
function getHideAmount() {
  const settings = read(KEYS.SETTINGS, {});
  return !!settings.hideAmount;
}

function setHideAmount(hide) {
  const settings = read(KEYS.SETTINGS, {});
  settings.hideAmount = !!hide;
  write(KEYS.SETTINGS, settings);
}

// 房贷计算器利率设置
function getMortgageRate() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageRate || '';
}

function setMortgageRate(rate) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageRate = rate;
  write(KEYS.SETTINGS, settings);
}

function getMortgageCommercialRate() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageCommercialRate || '';
}

function setMortgageCommercialRate(rate) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageCommercialRate = rate;
  write(KEYS.SETTINGS, settings);
}

// 公积金贷款利率记忆（独立键，避免与历史遗留的 mortgageRate 脏数据串用）
function getMortgageGjjRate() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageGjjRate || '';
}

function setMortgageGjjRate(rate) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageGjjRate = rate;
  write(KEYS.SETTINGS, settings);
}

// 房贷计算器贷款金额记忆（公积金 / 商业 / 组合总金额，单位：万元）
function getMortgageGjjAmount() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageGjjAmount || '';
}

function setMortgageGjjAmount(amount) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageGjjAmount = amount;
  write(KEYS.SETTINGS, settings);
}

function getMortgageCommercialAmount() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageCommercialAmount || '';
}

function setMortgageCommercialAmount(amount) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageCommercialAmount = amount;
  write(KEYS.SETTINGS, settings);
}

function getMortgageCombinedTotal() {
  const settings = read(KEYS.SETTINGS, {});
  return settings.mortgageCombinedTotal || '';
}

function setMortgageCombinedTotal(amount) {
  const settings = read(KEYS.SETTINGS, {});
  settings.mortgageCombinedTotal = amount;
  write(KEYS.SETTINGS, settings);
}

module.exports = {
  KEYS,
  init,
  syncFromCloud,
  syncToCloud,
  initNetworkListener,
  getMembers,
  resolveAvatarIcon,
  resolveAvatarImage,
  saveMembers,
  addMember,
  updateMember,
  deleteMember,
  getRecords,
  saveRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  getCategories,
  saveCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getAnchors,
  saveAnchors,
  getMemberAnchors,
  addAnchor,
  updateAnchor,
  deleteAnchor,
  getInitialAnchor,
  getMemberEvents,
  memberBalanceAt,
  memberBalance,
  familyBalance,
  memberBalanceTrend,
  balanceTrend,
  memberAssetTimeline,
  categoryStats,
  memberStats,
  getAssets,
  saveAssets,
  getAssetCategories,
  getPersonalAssets,
  getFamilyAssets,
  setAssetAmount,
  getAssetRecords,
  saveAssetRecords,
  addAssetRecord,
  updateAssetRecord,
  deleteAssetRecord,
  updateAssetRecordWithAmount,
  deleteAssetRecordWithAmount,
  personalAssetTotal,
  familyAssetTotal,
  allPersonalAssetTotal,
  liabilityTotal,
  totalAssets,
  currentAssetTotal,
  familyTotalAsset,
  getPresetAvatars,
  PERSONAL_ASSET_CATEGORIES,
  FAMILY_ASSET_CATEGORIES,
  DEFAULT_ASSET_CATEGORIES,
  PRESET_AVATARS,
  getGoals,
  saveGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  goalTotal,
  goalCurrentTotal,
  goalCurrentAmount,
  familyGoalCurrentAmount,
  familyGoalCurrentDetail,
  familyBalanceAt,
  monthGrowth,
  yearGrowth,
  monthRecordSum,
  yearRecordSum,
  getHideAmount,
  setHideAmount,
  getMortgageRate,
  setMortgageRate,
  getMortgageGjjRate,
  setMortgageGjjRate,
  getMortgageCommercialRate,
  setMortgageCommercialRate,
  getMortgageGjjAmount,
  setMortgageGjjAmount,
  getMortgageCommercialAmount,
  setMortgageCommercialAmount,
  getMortgageCombinedTotal,
  setMortgageCombinedTotal,
  getMemberHousingFundTotal,
  autoCreditHousingFund,
  getMemberPropertyIncomeTotal,
  getMemberPropertyExpenseTotal,
  autoCreditPropertyIncome
};
