const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount, formatInputAmount, parseAmount } = require('../../utils/formatUtil');

Page({
  data: {
    scope: 'personal',
    memberId: '',
    title: '',
    totalText: '0',
    personalTotalText: '0',
    familyTotalText: '0',
    items: [],
    // 资产变动明细
    assetRecords: [],
    // 编辑弹层（资产金额）
    showEditor: false,
    editCategory: '',
    editCategoryName: '',
    editIcon: '',
    editAmount: '',
    editAmountFocus: false,
    keyboardHeight: 0,
    hideAmount: false,
    // 左滑编辑/删除
    swipeKey: '',
    swipeOffset: 0,
    touchStartX: 0,
    touchStartY: 0,
    touchMoved: false,
    startOffset: 0,
    // 流动资产趋势
    trendRange: '30d',
    trendLabels: [],
    trendValues: [],
    trendTarget: 0,
    // 资产构成折叠（默认折叠）
    itemsCollapsed: true
  },

  onLoad(options) {
    const scope = options.scope || 'personal';
    const memberId = options.memberId || '';
    this.setData({ scope, memberId });
    wx.setNavigationBarTitle({
      title: scope === 'family' ? '非流动资产' : '个人资产'
    });
  },

  onShow() {
    this.setData({ hideAmount: storage.getHideAmount(), swipeKey: '', swipeOffset: 0 });
    this.loadData();
  },

  loadData() {
    const { scope, memberId } = this.data;
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    let items;
    let title;
    let assetRecords = [];
    let incomeTotal = 0;
    let expenseTotal = 0;
    if (scope === 'family') {
      items = storage.getFamilyAssets();
      title = '非流动资产';
    } else {
      items = storage.getPersonalAssets(memberId);
      const member = storage.getMembers().find(m => m.id === memberId);
      title = (member ? member.name : '') + '的个人资产';
      // 该成员的流入（收入）与支出
      storage.getRecords()
        .filter(r => r.memberId === memberId)
        .forEach(r => {
          if (r.type === 'income') incomeTotal += r.amount;
          else if (r.type === 'expense') expenseTotal += r.amount;
        });
      // 资产变动明细（该成员）：资产变动 + 收入 + 支出
      const catMap = {};
      storage.getCategories().forEach(c => { catMap[c.id] = c; });
      const memberMap = {};
      storage.getMembers().forEach(m => { memberMap[m.id] = m; });
      const list = [];
      storage.getAssetRecords()
        .filter(r => r.memberId === memberId)
        .forEach(r => {
          list.push(Object.assign({}, r, {
            recordType: 'asset',
            type: 'asset',
            categoryName: r.categoryName,
            icon: r.icon,
            color: '#42A5F5',
            memberName: memberMap[r.memberId] ? memberMap[r.memberId].name : '未知',
            amount: Math.abs(r.amount),
            sign: r.amount >= 0 ? '+' : '-'
          }));
        });
      storage.getRecords()
        .filter(r => r.memberId === memberId)
        .forEach(r => {
          const cat = catMap[r.categoryId];
          list.push({
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
      // 按日期倒序分组（与首页最近记录一致）
      list.sort((a, b) => (a.date < b.date ? 1 : -1));
      const groups = [];
      let current = null;
      list.forEach(item => {
        if (!current || current.date !== item.date) {
          current = { date: item.date, dateText: dateUtil.fullDate(item.date), items: [] };
          groups.push(current);
        }
        current.items.push(Object.assign({}, item, {
          amountText: money(item.amount),
          swipeKey: item.recordType + '_' + item.id
        }));
      });
      assetRecords = groups;
    }
    // 流动资产 = 资产构成各项之和 + 收入 - 支出（非流动资产页为 0）
    const personalTotal = scope === 'family' ? 0 : items.reduce((s, a) => s + a.amount, 0) + incomeTotal - expenseTotal;
    // 非流动资产 = 该成员名下非流动资产之和（个人页）；家庭页为全部非流动资产
    let familyTotal;
    if (scope === 'family') {
      familyTotal = items.reduce((s, a) => s + a.amount, 0);
    } else {
      familyTotal = storage.getAssets()
        .filter(a => a.scope === 'family' && a.memberId === memberId)
        .reduce((s, a) => s + a.amount, 0);
    }
    // 个人资产 = 流动资产 + 非流动资产；非流动资产页总额 = 各项资产之和
    const assetTotal = scope === 'family' ? familyTotal : personalTotal + familyTotal;
    const formatted = items.map(i => Object.assign({}, i, {
      amountText: money(i.amount)
    }));
    this.setData({
      title,
      totalText: money(assetTotal),
      personalTotalText: money(personalTotal),
      familyTotalText: money(familyTotal),
      items: formatted,
      assetRecords
    });
    // 个人资产页加载流动资产趋势
    if (scope === 'personal') {
      this.loadTrend();
    }
  },

  // 加载流动资产趋势（个人资产页）
  loadTrend() {
    const memberId = this.data.memberId;
    if (!memberId) return;
    const range = this.data.trendRange;
    let dates = [];
    let labels = [];
    if (range === '30d') {
      dates = dateUtil.lastNDays(30);
      labels = dates.map(d => {
        const p = d.split('-');
        return Number(p[1]) + '/' + Number(p[2]);
      });
    } else if (range === '6m') {
      dates = dateUtil.lastNMonthEnds(6);
      labels = dates.map(d => {
        const p = d.split('-');
        return Number(p[1]) + '月';
      });
    } else {
      dates = dateUtil.lastNMonthEnds(12);
      labels = dates.map(d => {
        const p = d.split('-');
        return Number(p[1]) + '月';
      });
    }
    const values = storage.memberBalanceTrend(memberId, dates);
    // 该成员的个人财务目标（若有）作为红线目标金额
    const goal = storage.getGoals().find(g => g.type === 'personal' && g.memberId === memberId);
    const trendTarget = goal ? (goal.targetAmount || 0) : 0;
    this.setData({ trendLabels: labels, trendValues: values, trendTarget });
  },

  onTrendRangeChange(e) {
    const range = e.currentTarget.dataset.range;
    if (range === this.data.trendRange) return;
    this.setData({ trendRange: range });
    this.loadTrend();
  },

  // 展开/折叠资产构成
  onToggleItems() {
    this.setData({ itemsCollapsed: !this.data.itemsCollapsed });
  },

  onAddAsset() {
    wx.setStorageSync('fb_preset_asset', true);
    wx.switchTab({ url: '/pages/record/record' });
  },

  onItemTap(e) {
    const category = e.currentTarget.dataset.category;
    const item = this.data.items.find(i => i.category === category);
    if (!item) return;
    this.setData({
      showEditor: true,
      editCategory: item.category,
      editCategoryName: item.categoryName,
      editIcon: item.icon,
      editAmount: item.amount !== 0 ? formatInputAmount(String(item.amount)) : ''
    });
  },

  onAmountInput(e) {
    this.setData({ editAmount: formatInputAmount(e.detail.value) });
  },

  onAmountFocus() {
    this.setData({ editAmountFocus: true });
  },

  onAmountBlur() {
    this.setData({ editAmountFocus: false });
  },

  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 });
  },

  onEditorClose() {
    this.setData({ showEditor: false });
  },

  onEditorSave() {
    const amount = parseAmount(this.data.editAmount);
    if (isNaN(amount)) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    storage.setAssetAmount(
      this.data.scope,
      this.data.memberId,
      this.data.editCategory,
      amount,
      dateUtil.today(),
      false // 资产构成编辑不记录变动，不出现在最近记录/变动明细
    );
    this.setData({ showEditor: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.loadData();
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
    if (this.data.swipeKey && this.data.swipeKey !== key) {
      this.setData({ swipeKey: '', swipeOffset: 0 });
    }
  },

  onTouchMove(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - this.data.touchStartX;
    const dy = touch.clientY - this.data.touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      this.setData({ touchMoved: true });
    }
    if (!this.data.touchMoved) return;
    let offset = this.data.startOffset + dx;
    offset = Math.max(-180, Math.min(0, offset));
    this.setData({ swipeOffset: offset });
  },

  onTouchEnd(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.touchMoved) return;
    const offset = this.data.swipeOffset;
    if (offset < -90) {
      this.setData({ swipeKey: key, swipeOffset: -180 });
    } else {
      this.setData({ swipeKey: '', swipeOffset: 0 });
    }
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
  },

  noop() {}
});
