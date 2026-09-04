const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount } = require('../../utils/formatUtil');

const ASSET_COLORS = ['#07C160', '#42A5F5', '#FF8A65', '#9575CD', '#4DB6AC', '#FFCA28', '#F06292', '#7986CB'];

Page({
  data: {
    totalBalance: '0',
    personalTotalText: '0',
    familyTotalText: '0',
    monthGrowthText: '0',
    monthGrowthPositive: true,
    yearGrowthText: '0',
    yearGrowthPositive: true,
    trendRange: 'year',
    trendData: { labels: [], values: [] },
    pieData: [],
    dailyGroups: [],
    hideAmount: false,
    // 左滑编辑/删除
    swipeKey: '',
    swipeOffset: 0,
    touchStartX: 0,
    touchStartY: 0,
    touchMoved: false,
    startOffset: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.setData({ hideAmount: storage.getHideAmount(), swipeKey: '', swipeOffset: 0 });
    this.loadData();
  },

  loadData() {
    const records = storage.getRecords();
    const members = storage.getMembers();
    const categories = storage.getCategories();
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);

    // 总资产（与资产tab一致：流动资产 + 非流动资产）
    const balance = storage.familyTotalAsset();
    const personalTotal = storage.currentAssetTotal();
    const familyTotal = storage.familyAssetTotal();

    // 本月新增 / 本年新增（本月/本年总览TAB「最近记录」所有明细之和：收入 + 资产变动 - 支出）
    const monthGrowth = storage.monthRecordSum(records);
    const yearGrowth = storage.yearRecordSum(records);

    // 最近记录（按日期倒序，按日分组：收入 + 支出 + 资产变动）
    const dailyGroups = this.buildDailyGroups(records, members, categories, hide);

    this.setData({
      totalBalance: money(balance),
      personalTotalText: money(personalTotal),
      familyTotalText: money(familyTotal),
      monthGrowthText: money(Math.abs(monthGrowth)),
      monthGrowthPositive: monthGrowth >= 0,
      yearGrowthText: money(Math.abs(yearGrowth)),
      yearGrowthPositive: yearGrowth >= 0,
      dailyGroups
    });

    this.loadPie();
    this.loadTrend();
  },

  // 按日分组：收入 + 支出 + 资产变动
  buildDailyGroups(records, members, categories, hide) {
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const money = (v) => hide ? '****' : formatAmount(v);

    // 合并收入/支出记录与资产变动记录
    const all = [];
    records.forEach(r => {
      const cat = catMap[r.categoryId];
      all.push({
        id: r.id,
        recordType: 'record',
        date: r.date,
        type: r.type,
        categoryName: cat ? cat.name : '未分类',
        icon: cat ? cat.icon : '❓',
        color: cat ? cat.color : '#999999',
        memberName: memberMap[r.memberId] ? memberMap[r.memberId].name : '未知',
        amount: r.amount,
        sign: r.type === 'income' ? '+' : '-'
      });
    });
    storage.getAssetRecords().forEach(a => {
      all.push({
        id: a.id,
        recordType: 'asset',
        date: a.date,
        type: 'asset',
        categoryName: a.categoryName,
        icon: a.icon,
        color: '#42A5F5',
        memberName: a.memberId && memberMap[a.memberId] ? memberMap[a.memberId].name : '家庭',
        amount: Math.abs(a.amount),
        sign: a.amount >= 0 ? '+' : '-'
      });
    });

    // 按日期倒序分组
    all.sort((a, b) => (a.date < b.date ? 1 : -1));
    const groups = [];
    let current = null;
    all.forEach(item => {
      if (!current || current.date !== item.date) {
        current = { date: item.date, dateText: dateUtil.fullDate(item.date), items: [] };
        groups.push(current);
      }
      current.items.push(Object.assign({}, item, {
        amountText: money(item.amount),
        swipeKey: item.recordType + '_' + item.id
      }));
    });
    return groups;
  },

  // 资产构成（按分类汇总，不细分到人）
  loadPie() {
    const members = storage.getMembers();
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const summary = {};
    // 个人资产：按分类汇总所有成员
    members.forEach(m => {
      storage.getPersonalAssets(m.id).forEach(item => {
        if (item.amount <= 0) return;
        if (!summary[item.category]) {
          summary[item.category] = { name: item.categoryName, value: 0 };
        }
        summary[item.category].value += item.amount;
      });
    });
    // 家庭资产：按分类汇总
    storage.getFamilyAssets().forEach(item => {
      if (item.amount <= 0) return;
      if (!summary[item.category]) {
        summary[item.category] = { name: item.categoryName, value: 0 };
      }
      summary[item.category].value += item.amount;
    });
    const pieData = Object.keys(summary).map((key, idx) => ({
      name: summary[key].name,
      value: summary[key].value,
      valueText: money(summary[key].value),
      color: ASSET_COLORS[idx % ASSET_COLORS.length]
    }));
    this.setData({ pieData });
  },

  onAssetTap() {
    wx.navigateTo({ url: '/pages/asset-overview/asset-overview' });
  },

  loadTrend() {
    const range = this.data.trendRange;
    let months;
    if (range === 'halfYear') {
      months = 6;
    } else if (range === 'threeYear') {
      months = 36;
    } else {
      months = 12;
    }
    const monthStrs = dateUtil.lastNMonths(months);
    // 数据点取每月最后一天（当月取今天），确保当月已录入的记录能反映到趋势图上
    const dates = dateUtil.lastNMonthEnds(months);
    const labels = monthStrs.map(m => m.slice(2));
    const values = storage.balanceTrend(dates);
    this.setData({
      trendData: { labels, values }
    });
  },

  onRangeChange(e) {
    this.setData({ trendRange: e.currentTarget.dataset.range });
    this.loadTrend();
  },

  // ============ 左滑编辑/删除 ============
  onTouchStart(e) {
    const key = e.currentTarget.dataset.key;
    const touch = e.touches[0];
    const startOffset = this.data.swipeKey === key ? this.data.swipeOffset : 0;
    this.setData({
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
      touchMoved: false,
      startOffset
    });
    // 点击其他记录时关闭已滑开的记录
    if (this.data.swipeKey && this.data.swipeKey !== key) {
      this.setData({ swipeKey: '', swipeOffset: 0 });
    }
  },

  onTouchMove(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - this.data.touchStartX;
    const dy = touch.clientY - this.data.touchStartY;
    // 判断是否为横向滑动
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      this.setData({ touchMoved: true });
    }
    if (!this.data.touchMoved) return;
    // 仅允许左滑（dx < 0），且不超过按钮宽度
    let offset = this.data.startOffset + dx;
    offset = Math.max(-180, Math.min(0, offset));
    this.setData({ swipeOffset: offset });
  },

  onTouchEnd(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.touchMoved) return;
    const offset = this.data.swipeOffset;
    // 滑动超过一半则展开，否则收起
    if (offset < -90) {
      this.setData({ swipeKey: key, swipeOffset: -180 });
    } else {
      this.setData({ swipeKey: '', swipeOffset: 0 });
    }
  },

  onSwipeClose() {
    this.setData({ swipeKey: '', swipeOffset: 0 });
  },

  onRecordTap(e) {
    // 若当前有记录处于左滑展开状态，点击时先收起，不跳转
    if (this.data.swipeKey) {
      this.setData({ swipeKey: '', swipeOffset: 0 });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const recordType = e.currentTarget.dataset.recordtype;
    wx.navigateTo({
      url: '/pages/record-detail/record-detail?id=' + id + '&recordType=' + recordType
    });
  },

  onEditRecord(e) {
    const id = e.currentTarget.dataset.id;
    const recordType = e.currentTarget.dataset.recordtype;
    this.setData({ swipeKey: '', swipeOffset: 0 });
    // record 为 tabBar 页面，通过全局存储传递编辑参数
    wx.setStorageSync('fb_edit_record', { id, recordType });
    wx.switchTab({ url: '/pages/record/record' });
  },

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    const recordType = e.currentTarget.dataset.recordtype;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除记录',
      content: '确定删除「' + name + '」这条记录吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          if (recordType === 'asset') {
            storage.deleteAssetRecordWithAmount(id);
          } else {
            storage.deleteRecord(id);
          }
          this.setData({ swipeKey: '', swipeOffset: 0 });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadData();
        }
      }
    });
  }
});
