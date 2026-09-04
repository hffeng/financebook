const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatInputAmount, parseAmount } = require('../../utils/formatUtil');

Page({
  data: {
    type: 'expense',
    amount: '',
    categories: [],
    selectedCategoryId: '',
    assetScope: 'personal',
    assetCategories: [],
    selectedAssetCategory: '',
    members: [],
    selectedMemberId: '',
    date: '',
    remark: '',
    remarkFocus: false,
    // 编辑模式
    editId: '',
    editRecordType: ''
  },

  onLoad() {
    this.setData({ date: dateUtil.today() });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 从「添加资产」入口跳转时预选资产类型
    const presetAsset = wx.getStorageSync('fb_preset_asset');
    if (presetAsset) {
      wx.removeStorageSync('fb_preset_asset');
      this.setData({ type: 'asset' });
    }
    // 从首页左滑「编辑」进入时加载编辑数据
    const edit = wx.getStorageSync('fb_edit_record');
    if (edit && edit.id) {
      wx.removeStorageSync('fb_edit_record');
      this.setData({ editId: edit.id, editRecordType: edit.recordType || 'record' });
      wx.setNavigationBarTitle({ title: '编辑记录' });
      this.loadEditData(edit.id, edit.recordType || 'record');
    }
    this.loadOptions();
  },

  loadOptions() {
    const type = this.data.type;
    const categories = storage.getCategories().filter(c => c.type === type);
    const assetCategories = storage.getAssetCategories(this.data.assetScope);
    const members = storage.getMembers();

    let selectedCategoryId = this.data.selectedCategoryId;
    if (!categories.find(c => c.id === selectedCategoryId)) {
      selectedCategoryId = categories.length > 0 ? categories[0].id : '';
    }

    let selectedAssetCategory = this.data.selectedAssetCategory;
    if (!assetCategories.find(c => c.key === selectedAssetCategory)) {
      selectedAssetCategory = assetCategories.length > 0 ? assetCategories[0].key : '';
    }

    let selectedMemberId = this.data.selectedMemberId;
    if (!members.find(m => m.id === selectedMemberId)) {
      selectedMemberId = members.length > 0 ? members[0].id : '';
    }

    this.setData({ categories, selectedCategoryId, assetCategories, selectedAssetCategory, members, selectedMemberId }, () => {
      // 非编辑模式下，自动选中分类时若有默认金额则自动填充
      if (!this.data.editId && this.data.type !== 'asset') {
        this.applyCategoryDefault(selectedCategoryId);
      }
    });
  },

  // 若所选分类配置了默认金额，则自动填充金额输入框（用户可自行修改）
  // 若新分类无默认金额，则清空金额，避免沿用上一个分类的金额
  applyCategoryDefault(categoryId) {
    const cat = this.data.categories.find(c => c.id === categoryId);
    if (cat && cat.defaultAmount && cat.defaultAmount > 0) {
      this.setData({ amount: formatInputAmount(String(cat.defaultAmount)) });
    } else {
      this.setData({ amount: '' });
    }
  },

  // 加载编辑数据
  loadEditData(id, recordType) {
    if (recordType === 'asset') {
      const rec = storage.getAssetRecords().find(r => r.id === id);
      if (!rec) return;
      // 资产变动记录 amount 为变动额，编辑时加载该资产当前值
      const asset = storage.getAssets().find(a =>
        a.scope === rec.scope && a.memberId === (rec.memberId || '') && a.category === rec.category
      );
      this.setData({
        type: 'asset',
        assetScope: rec.scope || 'personal',
        selectedAssetCategory: rec.category || '',
        selectedMemberId: rec.memberId || '',
        amount: formatInputAmount(String(asset ? asset.amount : rec.amount)),
        date: rec.date || dateUtil.today()
      });
    } else {
      const rec = storage.getRecords().find(r => r.id === id);
      if (!rec) return;
      this.setData({
        type: rec.type || 'expense',
        selectedCategoryId: rec.categoryId || '',
        selectedMemberId: rec.memberId || '',
        amount: formatInputAmount(String(rec.amount)),
        date: rec.date || dateUtil.today(),
        remark: rec.remark || ''
      });
    }
  },

  onTypeChange(e) {
    this.setData({ type: e.currentTarget.dataset.type });
    this.loadOptions();
  },

  onAmountInput(e) {
    this.setData({ amount: formatInputAmount(e.detail.value) });
  },

  onCategorySelect(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedCategoryId: id });
    this.applyCategoryDefault(id);
  },

  onAssetCategorySelect(e) {
    this.setData({ selectedAssetCategory: e.currentTarget.dataset.key });
  },

  onAssetScopeChange(e) {
    this.setData({ assetScope: e.currentTarget.dataset.scope });
    this.loadOptions();
  },

  onMemberSelect(e) {
    this.setData({ selectedMemberId: e.currentTarget.dataset.id });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onRemarkFocus() {
    this.setData({ remarkFocus: true });
  },

  onRemarkBlur() {
    this.setData({ remarkFocus: false });
  },

  onSubmit() {
    const amount = parseAmount(this.data.amount);
    const editId = this.data.editId;
    const editRecordType = this.data.editRecordType;

    if (this.data.type === 'asset') {
      // 资产允许为负
      if (isNaN(amount)) {
        wx.showToast({ title: '请输入有效金额', icon: 'none' });
        return;
      }
      if (!this.data.selectedAssetCategory) {
        wx.showToast({ title: '请选择资产类型', icon: 'none' });
        return;
      }
      const scope = this.data.assetScope === 'family' ? 'family' : 'personal';
      // 流动资产与非流动资产均需指定成员
      if (!this.data.selectedMemberId) {
        wx.showToast({ title: '请选择成员', icon: 'none' });
        return;
      }
      const memberId = this.data.selectedMemberId;
      const assetAmount = Math.round(amount * 100) / 100;
      if (editId) {
        if (editRecordType === 'asset') {
          // 原为资产记录：直接更新
          storage.updateAssetRecordWithAmount(editId, {
            scope,
            memberId,
            category: this.data.selectedAssetCategory,
            amount: assetAmount,
            date: this.data.date
          });
        } else {
          // 原为普通记录，改为资产：删除原普通记录，新增资产记录
          storage.deleteRecord(editId);
          storage.setAssetAmount(
            scope,
            memberId,
            this.data.selectedAssetCategory,
            assetAmount,
            this.data.date
          );
        }
      } else {
        storage.setAssetAmount(
          scope,
          memberId,
          this.data.selectedAssetCategory,
          assetAmount,
          this.data.date
        );
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ amount: '', editId: '', editRecordType: '' });
      wx.setNavigationBarTitle({ title: '记一笔' });
      return;
    }

    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!this.data.selectedMemberId) {
      wx.showToast({ title: '请选择成员', icon: 'none' });
      return;
    }
    if (!this.data.selectedCategoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    const recordData = {
      memberId: this.data.selectedMemberId,
      type: this.data.type,
      amount: Math.round(amount * 100) / 100,
      categoryId: this.data.selectedCategoryId,
      date: this.data.date,
      remark: this.data.remark
    };
    if (editId) {
      if (editRecordType === 'asset') {
        // 原为资产记录，改为普通记录：删除原资产记录（回退资产金额），新增普通记录
        storage.deleteAssetRecordWithAmount(editId);
        storage.addRecord(recordData);
      } else {
        storage.updateRecord(editId, recordData);
      }
    } else {
      storage.addRecord(recordData);
    }

    wx.showToast({ title: '已保存', icon: 'success' });
    // 重置表单
    this.setData({
      amount: '',
      remark: '',
      editId: '',
      editRecordType: ''
    });
    wx.setNavigationBarTitle({ title: '记一笔' });
  }
});
