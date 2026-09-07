const storage = require('../../services/storageService');
const dateUtil = require('../../utils/dateUtil');
const { formatAmount, formatInputAmount, parseAmount } = require('../../utils/formatUtil');

const AVATAR_COLORS = ['#07C160', '#42A5F5', '#FF8A65', '#9575CD', '#4DB6AC', '#FFCA28', '#F06292', '#7986CB'];
const GOAL_ICONS = ['🎯', '🏠', '✈️', '⌚'];

Page({
  data: {
    // 财务目标
    goals: [],
    archivedGoals: [],
    // 已完成目标折叠状态（默认折叠）
    archivedCollapsed: true,
    // 目标管理弹层
    showGoalModal: false,
    editingGoalId: '',
    goalForm: { name: '', type: 'family', memberId: '', targetAmount: '', icon: '🎯', color: '#07C160' },
    goalIcons: GOAL_ICONS,
    goalFamilyBalanceText: '0',
    goalMemberBalanceText: '0',
    // 成员
    members: [],
    // 拖动排序
    dragIndex: -1,
    dragY: 0,
    dragOffset: 0,
    itemHeight: 0,
    sorting: false,
    // 金额隐藏开关
    hideAmount: false
  },

  onLoad() {},

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    this.setData({ hideAmount: storage.getHideAmount() });
    this.loadGoals();
    this.loadMembers();
  },

  onHideAmountChange(e) {
    const hide = e.detail.value;
    storage.setHideAmount(hide);
    this.setData({ hideAmount: hide });
  },

  // ============ 财务目标 ============
  loadGoals() {
    const members = storage.getMembers();
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const decorate = (g) => {
      const currentAmount = storage.goalCurrentAmount(g);
      const percent = g.targetAmount > 0 ? Math.min(100, (currentAmount / g.targetAmount) * 100) : 0;
      const member = g.type === 'personal' ? members.find(m => m.id === g.memberId) : null;
      // 家庭目标展示当前已存的计算口径（固定公式，不展示数字）
      let calcText = '';
      if (g.type === 'family') {
        calcText = '流动资产 + 收入 - 支出';
      }
      return Object.assign({}, g, {
        currentAmount,
        typeText: g.type === 'personal' ? '个人目标' : '家庭目标',
        memberName: member ? member.name : '',
        targetText: money(g.targetAmount),
        currentText: money(currentAmount),
        calcText,
        percent: Math.round(percent)
      });
    };
    const all = storage.getGoals();
    const goals = all.filter(g => !g.archived).map(decorate);
    const archivedGoals = all.filter(g => g.archived).map(g => {
      const start = g.createdAt ? dateUtil.formatDate(new Date(g.createdAt)) : '';
      const end = g.archivedAt ? dateUtil.formatDate(new Date(g.archivedAt)) : '';
      return Object.assign(decorate(g), {
        percent: 100,
        periodText: start && end ? start + ' ~ ' + end : ''
      });
    });
    this.setData({ goals, archivedGoals });
  },

  onAddGoal() {
    const money = (v) => this.data.hideAmount ? '****' : formatAmount(v);
    this.setData({
      showGoalModal: true,
      editingGoalId: '',
      goalForm: { name: '', type: 'family', memberId: '', targetAmount: '', icon: '🎯', color: '#07C160' },
      goalFamilyBalanceText: money(storage.familyGoalCurrentAmount()),
      goalMemberBalanceText: '0.00'
    });
  },

  onEditGoal(e) {
    const id = e.currentTarget.dataset.id;
    const goal = this.data.goals.find(g => g.id === id);
    if (!goal) return;
    const money = (v) => this.data.hideAmount ? '****' : formatAmount(v);
    const memberBalance = goal.memberId ? storage.memberBalanceAt(goal.memberId, dateUtil.today()) : 0;
    this.setData({
      showGoalModal: true,
      editingGoalId: id,
      goalForm: {
        name: goal.name,
        type: goal.type || 'family',
        memberId: goal.memberId || '',
        targetAmount: formatInputAmount(String(goal.targetAmount)),
        icon: goal.icon || '🎯',
        color: goal.color || '#07C160'
      },
      goalFamilyBalanceText: money(storage.familyGoalCurrentAmount()),
      goalMemberBalanceText: money(memberBalance)
    });
  },

  onGoalTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 'goalForm.type': type });
  },

  onGoalMemberChange(e) {
    const memberId = e.currentTarget.dataset.id;
    const money = (v) => this.data.hideAmount ? '****' : formatAmount(v);
    this.setData({
      'goalForm.memberId': memberId,
      goalMemberBalanceText: money(storage.memberBalanceAt(memberId, dateUtil.today()))
    });
  },

  onGoalInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = field === 'targetAmount' ? formatInputAmount(e.detail.value) : e.detail.value;
    this.setData({ ['goalForm.' + field]: value });
  },

  onGoalIcon(e) {
    this.setData({ 'goalForm.icon': e.currentTarget.dataset.icon });
  },

  onGoalSave() {
    const f = this.data.goalForm;
    const name = (f.name || '').trim();
    const target = parseAmount(f.targetAmount);
    if (!name) {
      wx.showToast({ title: '请输入目标名称', icon: 'none' });
      return;
    }
    if (!target || target <= 0) {
      wx.showToast({ title: '请输入有效的目标金额', icon: 'none' });
      return;
    }
    if (f.type === 'personal' && !f.memberId) {
      wx.showToast({ title: '请选择所属成员', icon: 'none' });
      return;
    }
    const data = {
      name,
      type: f.type || 'family',
      memberId: f.type === 'personal' ? f.memberId : '',
      targetAmount: target,
      icon: f.icon || '🎯',
      color: f.color || '#07C160'
    };
    if (this.data.editingGoalId) {
      storage.updateGoal(this.data.editingGoalId, data);
    } else {
      storage.addGoal(data);
    }
    this.setData({ showGoalModal: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.loadGoals();
  },

  onDeleteGoal(e) {
    const id = e.currentTarget.dataset.id;
    const goal = this.data.goals.find(g => g.id === id);
    if (!goal) return;
    wx.showModal({
      title: '删除目标',
      content: '确定删除「' + goal.name + '」吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          storage.deleteGoal(id);
          this.setData({ showGoalModal: false });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadGoals();
        }
      }
    });
  },

  onGoalClose() {
    this.setData({ showGoalModal: false });
  },

  onArchiveGoal(e) {
    const id = e.currentTarget.dataset.id;
    const goal = this.data.goals.find(g => g.id === id);
    if (!goal) return;
    wx.showModal({
      title: '归档目标',
      content: '确定将「' + goal.name + '」标记为已完成并归档吗？',
      confirmColor: '#07C160',
      success: (res) => {
        if (res.confirm) {
          storage.archiveGoal(id);
          wx.showToast({ title: '已归档', icon: 'success' });
          this.loadGoals();
        }
      }
    });
  },

  onUnarchiveGoal(e) {
    const id = e.currentTarget.dataset.id;
    storage.unarchiveGoal(id);
    wx.showToast({ title: '已恢复', icon: 'success' });
    this.loadGoals();
  },

  onToggleArchived() {
    this.setData({ archivedCollapsed: !this.data.archivedCollapsed });
  },

  // ============ 成员管理 ============
  loadMembers() {
    const hide = this.data.hideAmount;
    const money = (v) => hide ? '****' : formatAmount(v);
    const members = storage.getMembers().map(m => {
      const balance = storage.memberBalance(m.id);
      return Object.assign({}, m, { balanceText: money(balance) });
    });
    this.setData({ members });
  },

  onAddMember() {
    this.promptName('', (name) => {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      storage.addMember(name, color, '');
      this.loadMembers();
    });
  },

  onViewAsset(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/asset-detail/asset-detail?scope=personal&memberId=' + id });
  },

  onEditMember(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/member-edit/member-edit?id=' + id });
  },

  onDeleteMember(e) {
    const id = e.currentTarget.dataset.id;
    const member = this.data.members.find(m => m.id === id);
    if (!member) return;
    wx.showModal({
      title: '删除成员',
      content: '确定删除「' + member.name + '」吗？该成员的记账记录也会一并删除。',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          storage.deleteMember(id);
          this.loadMembers();
        }
      }
    });
  },

  // ============ 长按拖动排序 ============
  onSortStart(e) {
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];
    const query = this.createSelectorQuery();
    query.select('.member-card').boundingClientRect((rect) => {
      if (!rect) return;
      const itemHeight = rect.height + 32; // 卡片高度 + margin
      this.setData({
        sorting: true,
        dragIndex: index,
        dragY: touch.clientY,
        dragOffset: 0,
        itemHeight
      });
    }).exec();
  },

  onSortMove(e) {
    if (!this.data.sorting) return;
    const touch = e.touches[0];
    const delta = touch.clientY - this.data.dragY;
    const newOffset = this.data.dragOffset + delta;
    const itemHeight = this.data.itemHeight;
    const currentIndex = this.data.dragIndex;
    let targetIndex = currentIndex + Math.round(newOffset / itemHeight);
    targetIndex = Math.max(0, Math.min(this.data.members.length - 1, targetIndex));

    this.setData({
      dragY: touch.clientY,
      dragOffset: newOffset
    });

    if (targetIndex !== currentIndex) {
      const members = this.data.members.slice();
      const [moved] = members.splice(currentIndex, 1);
      members.splice(targetIndex, 0, moved);
      this.setData({
        members,
        dragIndex: targetIndex,
        dragOffset: 0
      });
    }
  },

  onSortEnd() {
    if (!this.data.sorting) return;
    // 保存新顺序（仅保留原始成员字段）
    const ordered = this.data.members.map(m => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      avatarIcon: m.avatarIcon || '',
      createdAt: m.createdAt
    }));
    storage.saveMembers(ordered);
    this.setData({ sorting: false, dragIndex: -1, dragOffset: 0 });
    wx.showToast({ title: '排序已保存', icon: 'success' });
    this.loadMembers();
  },

  onOpenMortgage() {
    wx.navigateTo({ url: '/pages/mortgage/mortgage' });
  },

  noop() {},

  promptName(current, callback) {
    wx.showModal({
      title: current ? '编辑成员' : '添加成员',
      editable: true,
      placeholderText: '请输入成员姓名',
      content: current || '',
      success: (res) => {
        if (res.confirm) {
          const name = (res.content || '').trim();
          if (!name) {
            wx.showToast({ title: '姓名不能为空', icon: 'none' });
            return;
          }
          callback(name);
        }
      }
    });
  }
});
