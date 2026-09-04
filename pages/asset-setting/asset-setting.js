const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount, formatInputAmount, parseAmount } = require('../../utils/formatUtil');

Page({
  data: {
    members: [],
    selectedMemberId: '',
    selectedMember: null,
    initialDate: '',
    initialAmount: '',
    snapshots: [],
    showSnapshotEditor: false,
    snapshotDate: '',
    snapshotAmount: '',
    snapshotNote: '',
    hideAmount: false
  },

  onShow() {
    const members = storage.getMembers();
    let selectedMemberId = this.data.selectedMemberId;
    if (!members.find(m => m.id === selectedMemberId)) {
      selectedMemberId = members.length > 0 ? members[0].id : '';
    }
    this.setData({ members, selectedMemberId, hideAmount: storage.getHideAmount() });
    this.loadMemberData();
  },

  loadMemberData() {
    const memberId = this.data.selectedMemberId;
    if (!memberId) {
      this.setData({ selectedMember: null, snapshots: [] });
      return;
    }
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const member = storage.getMembers().find(m => m.id === memberId);
    const initial = storage.getInitialAnchor(memberId);
    const snapshots = storage.getMemberAnchors(memberId)
      .filter(a => a.type === 'snapshot')
      .map(a => Object.assign({}, a, { amountText: money(a.amount) }));

    this.setData({
      selectedMember: member,
      initialDate: initial ? initial.date : dateUtil.today(),
      initialAmount: initial ? formatInputAmount(String(initial.amount)) : '',
      snapshots
    });
  },

  onMemberSelect(e) {
    this.setData({ selectedMemberId: e.currentTarget.dataset.id });
    this.loadMemberData();
  },

  onInitialDateChange(e) {
    this.setData({ initialDate: e.detail.value });
  },

  onInitialAmountInput(e) {
    this.setData({ initialAmount: formatInputAmount(e.detail.value) });
  },

  onSaveInitial() {
    const memberId = this.data.selectedMemberId;
    const amount = parseAmount(this.data.initialAmount);
    if (!amount || amount < 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    const existing = storage.getInitialAnchor(memberId);
    const data = {
      memberId,
      type: 'initial',
      date: this.data.initialDate,
      amount: Math.round(amount * 100) / 100,
      note: '期初资产'
    };
    if (existing) {
      storage.updateAnchor(existing.id, data);
    } else {
      storage.addAnchor(data);
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    this.loadMemberData();
  },

  onAddSnapshot() {
    this.setData({
      showSnapshotEditor: true,
      snapshotDate: dateUtil.today(),
      snapshotAmount: '',
      snapshotNote: ''
    });
  },

  onSnapshotDateChange(e) {
    this.setData({ snapshotDate: e.detail.value });
  },

  onSnapshotAmountInput(e) {
    this.setData({ snapshotAmount: formatInputAmount(e.detail.value) });
  },

  onSnapshotNoteInput(e) {
    this.setData({ snapshotNote: e.detail.value });
  },

  onSnapshotEditorClose() {
    this.setData({ showSnapshotEditor: false });
  },

  onSnapshotSave() {
    const amount = parseAmount(this.data.snapshotAmount);
    if (!amount || amount < 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    storage.addAnchor({
      memberId: this.data.selectedMemberId,
      type: 'snapshot',
      date: this.data.snapshotDate,
      amount: Math.round(amount * 100) / 100,
      note: this.data.snapshotNote
    });
    this.setData({ showSnapshotEditor: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.loadMemberData();
  },

  onDeleteSnapshot(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除快照',
      content: '确定删除该资产快照吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          storage.deleteAnchor(id);
          this.loadMemberData();
        }
      }
    });
  },

  noop() {}
});
