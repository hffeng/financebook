const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount } = require('../../utils/formatUtil');

Page({
  data: {
    members: [],
    selectedMemberId: '',
    selectedMember: null,
    initialText: '0',
    currentText: '0',
    change: 0,
    changeText: '0',
    range: 'month',
    trendData: { labels: [], values: [] },
    anchors: [],
    hideAmount: false
  },

  onLoad(options) {
    if (options && options.memberId) {
      this.presetMemberId = options.memberId;
    }
  },

  onShow() {
    const members = storage.getMembers();
    let selectedMemberId = this.presetMemberId || this.data.selectedMemberId;
    if (!members.find(m => m.id === selectedMemberId)) {
      selectedMemberId = members.length > 0 ? members[0].id : '';
    }
    this.setData({ members, selectedMemberId, hideAmount: storage.getHideAmount() });
    this.loadMemberData();
  },

  loadMemberData() {
    const memberId = this.data.selectedMemberId;
    if (!memberId) {
      this.setData({ selectedMember: null, anchors: [] });
      return;
    }
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const member = storage.getMembers().find(m => m.id === memberId);
    const timeline = storage.memberAssetTimeline(memberId, []);
    const anchors = storage.getMemberAnchors(memberId)
      .map(a => Object.assign({}, a, { amountText: money(a.amount) }));

    this.setData({
      selectedMember: member,
      initialText: money(timeline.initial),
      currentText: money(timeline.current),
      change: timeline.change,
      changeText: money(Math.abs(timeline.change)),
      anchors
    });

    this.loadTrend();
  },

  loadTrend() {
    const memberId = this.data.selectedMemberId;
    if (!memberId) return;
    let dates;
    let labels;
    if (this.data.range === 'month') {
      dates = dateUtil.lastNDays(30);
      labels = dates.map(d => d.slice(5));
    } else {
      dates = dateUtil.lastNMonths(12).map(m => m + '-01');
      labels = dateUtil.lastNMonths(12).map(m => m.slice(2));
    }
    const values = storage.memberBalanceTrend(memberId, dates);
    this.setData({ trendData: { labels, values } });
  },

  onMemberSelect(e) {
    this.setData({ selectedMemberId: e.currentTarget.dataset.id });
    this.loadMemberData();
  },

  onRangeChange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.loadTrend();
  }
});
