const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount } = require('../../utils/formatUtil');

Page({
  data: {
    range: 'month',
    totalIncome: '0',
    totalExpense: '0',
    totalBalance: '0',
    // 资产总览
    totalAssetText: '0',
    currentAssetText: '0',
    familyAssetText: '0',
    memberStats: [],
    pieType: 'expense',
    pieData: [],
    hideAmount: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.setData({ hideAmount: storage.getHideAmount() });
    this.loadData();
  },

  getRange() {
    const range = this.data.range;
    const now = new Date();
    if (range === 'month') {
      return { start: dateUtil.monthStart(now), end: dateUtil.monthEnd(now) };
    } else if (range === 'lastMonth') {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: dateUtil.monthStart(last), end: dateUtil.monthEnd(last) };
    }
    return { start: '', end: '' };
  },

  loadData() {
    const { start, end } = this.getRange();
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const records = storage.getRecords().filter(r => {
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      return true;
    });

    let income = 0;
    let expense = 0;
    records.forEach(r => {
      if (r.type === 'income') income += r.amount;
      else if (r.type === 'expense') expense += r.amount;
    });

    const memberStats = storage.memberStats(start, end).map(m => {
      return Object.assign({}, m, {
        incomeText: money(m.income),
        expenseText: money(m.expense),
        balanceText: money(m.balance)
      });
    });

    // 资产总览：流动资产 = 各成员流动资产之和；家庭总资产 = 流动资产 + 非流动资产
    const currentAsset = storage.currentAssetTotal();
    const familyAsset = storage.familyAssetTotal();
    const totalAsset = storage.familyTotalAsset();

    this.setData({
      totalIncome: money(income),
      totalExpense: money(expense),
      totalBalance: money(income - expense),
      totalAssetText: money(totalAsset),
      currentAssetText: money(currentAsset),
      familyAssetText: money(familyAsset),
      memberStats
    });

    this.loadPie();
  },

  loadPie() {
    const type = this.data.pieType;
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    // 分类统计与当前时间范围（本月/上月/全部）联动
    const { start, end } = this.getRange();
    const stats = storage.categoryStats(type, '', start, end);
    const total = stats.reduce((s, d) => s + d.amount, 0);
    const pieData = stats.map(d => {
      return Object.assign({}, d, {
        value: d.amount,
        amountText: money(d.amount),
        percent: total > 0 ? Math.round((d.amount / total) * 100) : 0
      });
    });
    this.setData({ pieData });
  },

  onRangeChange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.loadData();
  },

  onPieTypeChange(e) {
    this.setData({ pieType: e.currentTarget.dataset.type });
    this.loadPie();
  },

  onMemberTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/asset-detail/asset-detail?scope=personal&memberId=' + id });
  }
});
