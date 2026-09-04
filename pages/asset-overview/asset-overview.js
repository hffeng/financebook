const storage = require('../../services/storageService');
const { formatAmount } = require('../../utils/formatUtil');

Page({
  data: {
    totalText: '0',
    personalTotalText: '0',
    familyTotalText: '0',
    personalAssets: [],
    familyAssets: [],
    hideAmount: false
  },

  onShow() {
    this.setData({ hideAmount: storage.getHideAmount() });
    this.loadData();
  },

  loadData() {
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const members = storage.getMembers();
    const personalAssets = members.map(m => {
      const items = storage.getPersonalAssets(m.id);
      // 与资产tab/资产详情一致：个人资产 = 资产构成之和 + 收入 - 支出
      const total = storage.memberBalance(m.id);
      return {
        memberId: m.id,
        name: m.name,
        avatar: m.avatar,
        avatarIcon: m.avatarIcon || '',
        totalText: money(total),
        itemCount: items.filter(i => i.amount > 0).length
      };
    });

    const familyItems = storage.getFamilyAssets();
    const familyAssets = familyItems.map(i => Object.assign({}, i, {
      amountText: money(i.amount)
    }));

    // 流动资产 = 各成员流动资产之和（含收入-支出）；家庭总资产 = 流动资产 + 非流动资产 - 负债
    const personalTotal = storage.currentAssetTotal();
    const familyTotal = storage.familyAssetTotal();
    const total = storage.familyTotalAsset();

    this.setData({
      totalText: money(total),
      personalTotalText: money(personalTotal),
      familyTotalText: money(familyTotal),
      personalAssets,
      familyAssets
    });
  },

  onPersonalTap(e) {
    const memberId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/asset-detail/asset-detail?scope=personal&memberId=' + memberId
    });
  },

  onFamilyTap() {
    wx.navigateTo({
      url: '/pages/asset-detail/asset-detail?scope=family'
    });
  }
});
