const storage = require('../../services/storageService');
const { formatInputAmount } = require('../../utils/formatUtil');

const ICONS = ['🍜', '🚗', '🛍️', '🏠', '🎮', '💊', '📦', '💰', '🎁', '📈', '✈️', '🎓', '🐱', '🎬', '☕', '📱', '💄', '⚽', '📚', '🧸', '✨', '📌', '📋', '🧾', '📺', '😴', '🧽', '💉', '🤕', '🩸', '👃', '🤧'];

Page({
  data: {
    expenseCats: [],
    incomeCats: [],
    personalAssetCats: [],
    familyAssetCats: [],
    liabilityCats: [],
    // 折叠面板展开状态（key 为类型，value 为是否展开）
    collapsed: {
      expense: false,
      income: true,
      asset_personal: true,
      asset_family: true,
      liability: true
    },
    // 编辑弹层
    showEditor: false,
    editType: 'expense',
    editName: '',
    editIcon: '📌',
    editDefaultAmount: '',
    editId: '',
    icons: ICONS,
    keyboardHeight: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.loadCategories();
  },

  loadCategories() {
    const cats = storage.getCategories();
    this.setData({
      expenseCats: cats.filter(c => c.type === 'expense'),
      incomeCats: cats.filter(c => c.type === 'income'),
      personalAssetCats: cats.filter(c => c.type === 'asset_personal'),
      familyAssetCats: cats.filter(c => c.type === 'asset_family'),
      liabilityCats: cats.filter(c => c.type === 'liability')
    });
  },

  onToggleSection(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ ['collapsed.' + type]: !this.data.collapsed[type] });
  },

  onAdd() {
    this.setData({
      showEditor: true,
      editId: '',
      editType: 'expense',
      editName: '',
      editIcon: ICONS[0],
      editDefaultAmount: ''
    });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const cat = storage.getCategories().find(c => c.id === id);
    if (!cat) return;
    this.setData({
      showEditor: true,
      editId: id,
      editType: cat.type,
      editName: cat.name,
      editIcon: cat.icon,
      editDefaultAmount: cat.defaultAmount ? formatInputAmount(String(cat.defaultAmount)) : ''
    });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const cat = storage.getCategories().find(c => c.id === id);
    if (!cat) return;
    wx.showModal({
      title: '删除分类',
      content: '确定删除「' + cat.name + '」分类吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          storage.deleteCategory(id);
          this.loadCategories();
        }
      }
    });
  },

  onEditorTypeChange(e) {
    this.setData({ editType: e.currentTarget.dataset.type });
  },

  onNameInput(e) {
    this.setData({ editName: e.detail.value });
  },

  onDefaultAmountInput(e) {
    this.setData({ editDefaultAmount: formatInputAmount(e.detail.value) });
  },

  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 });
  },

  onIconSelect(e) {
    this.setData({ editIcon: e.currentTarget.dataset.icon });
  },

  noop() {},

  onEditorClose() {
    this.setData({ showEditor: false });
  },

  onEditorSave() {
    const name = this.data.editName.trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }
    const data = {
      name,
      type: this.data.editType,
      icon: this.data.editIcon
    };
    // 收入/支出分类支持默认金额（记一笔时自动填充）
    if (this.data.editType === 'income' || this.data.editType === 'expense') {
      const defaultAmount = parseFloat(String(this.data.editDefaultAmount).replace(/,/g, ''));
      data.defaultAmount = !isNaN(defaultAmount) && defaultAmount > 0 ? Math.round(defaultAmount * 100) / 100 : 0;
    }
    // 资产分类需要 key 作为唯一标识（资产记录通过 category 引用 key）
    if (this.data.editType === 'asset_personal' || this.data.editType === 'asset_family') {
      if (this.data.editId) {
        const existing = storage.getCategories().find(c => c.id === this.data.editId);
        data.key = existing ? existing.key : this.data.editId;
      } else {
        data.key = 'ast_' + Date.now();
      }
    }
    if (this.data.editId) {
      storage.updateCategory(this.data.editId, data);
    } else {
      storage.addCategory(data);
    }
    this.setData({ showEditor: false });
    this.loadCategories();
  }
});
