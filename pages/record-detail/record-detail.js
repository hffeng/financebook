const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount } = require('../../utils/formatUtil');

Page({
  data: {
    record: null,
    hideAmount: false
  },

  onLoad(options) {
    this.recordId = options.id || '';
    this.recordType = options.recordType || 'record';
  },

  onShow() {
    this.setData({ hideAmount: storage.getHideAmount() });
    this.loadDetail();
  },

  loadDetail() {
    const id = this.recordId;
    if (!id) return;
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);

    if (this.recordType === 'asset') {
      const rec = storage.getAssetRecords().find(r => r.id === id);
      if (!rec) return;
      const member = storage.getMembers().find(m => m.id === rec.memberId);
      const scopeName = rec.scope === 'family' ? '非流动资产' : '流动资产';
      this.setData({
        record: {
          icon: rec.icon || '📦',
          categoryName: rec.categoryName || '未分类',
          type: 'asset',
          typeName: '资产变动',
          scopeName,
          memberName: member ? member.name : '家庭',
          amountText: money(Math.abs(rec.amount)),
          sign: rec.amount >= 0 ? '+' : '-',
          date: rec.date || '',
          dateText: dateUtil.fullDate(rec.date),
          remark: '资产金额调整'
        }
      });
    } else {
      const rec = storage.getRecords().find(r => r.id === id);
      if (!rec) return;
      const cat = storage.getCategories().find(c => c.id === rec.categoryId);
      const member = storage.getMembers().find(m => m.id === rec.memberId);
      const typeName = rec.type === 'income' ? '收入' : (rec.type === 'expense' ? '支出' : '记录');
      this.setData({
        record: {
          icon: cat ? cat.icon : '❓',
          categoryName: cat ? cat.name : '未分类',
          type: rec.type,
          typeName,
          memberName: member ? member.name : '未知',
          amountText: money(rec.amount),
          sign: rec.type === 'income' ? '+' : '-',
          date: rec.date || '',
          dateText: dateUtil.fullDate(rec.date),
          remark: rec.remark || ''
        }
      });
    }
  },

  onEdit() {
    const id = this.recordId;
    const recordType = this.recordType;
    wx.setStorageSync('fb_edit_record', { id, recordType });
    wx.switchTab({ url: '/pages/record/record' });
  },

  onDelete() {
    const id = this.recordId;
    const recordType = this.recordType;
    const name = this.data.record ? this.data.record.categoryName : '';
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
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 500);
        }
      }
    });
  }
});
