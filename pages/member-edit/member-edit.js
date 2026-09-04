const storage = require('../../services/storageService');
const { formatInputAmount, parseAmount } = require('../../utils/formatUtil');

Page({
  data: {
    memberId: '',
    member: null,
    name: '',
    presetAvatars: [],
    selectedAvatarKey: '',
    housingFundInput: '',
    propertyIncomeInput: '',
    propertyExpenseInput: ''
  },

  onLoad(options) {
    const memberId = options.id || '';
    this.setData({
      memberId,
      presetAvatars: storage.getPresetAvatars()
    });
    this.loadMember();
  },

  loadMember() {
    const member = storage.getMembers().find(m => m.id === this.data.memberId);
    if (!member) {
      wx.showToast({ title: '成员不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      member,
      name: member.name || '',
      selectedAvatarKey: member.avatarIcon || '',
      housingFundInput: member.housingFund ? formatInputAmount(String(member.housingFund)) : '',
      propertyIncomeInput: member.propertyIncome ? formatInputAmount(String(member.propertyIncome)) : '',
      propertyExpenseInput: member.propertyExpense ? formatInputAmount(String(member.propertyExpense)) : ''
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onAvatarSelect(e) {
    this.setData({ selectedAvatarKey: e.currentTarget.dataset.key });
  },

  onHousingFundInput(e) {
    this.setData({ housingFundInput: formatInputAmount(e.detail.value) });
  },

  onPropertyIncomeInput(e) {
    this.setData({ propertyIncomeInput: formatInputAmount(e.detail.value) });
  },

  onPropertyExpenseInput(e) {
    this.setData({ propertyExpenseInput: formatInputAmount(e.detail.value) });
  },

  onSave() {
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入成员姓名', icon: 'none' });
      return;
    }
    const preset = storage.getPresetAvatars().find(a => a.key === this.data.selectedAvatarKey);
    const val = parseAmount(this.data.housingFundInput) || 0;
    const propertyIncome = parseAmount(this.data.propertyIncomeInput) || 0;
    const propertyExpense = parseAmount(this.data.propertyExpenseInput) || 0;

    const data = { name };
    if (preset) {
      data.avatarIcon = preset.key;
      data.avatar = preset.color;
    }
    data.housingFund = Math.round(val * 100) / 100;
    data.propertyIncome = Math.round(propertyIncome * 100) / 100;
    data.propertyExpense = Math.round(propertyExpense * 100) / 100;

    storage.updateMember(this.data.memberId, data);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  }
});
