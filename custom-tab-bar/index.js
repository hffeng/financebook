Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '总览',
        icon: 'home',
        iconActive: 'home-active'
      },
      {
        pagePath: '/pages/statistics/statistics',
        text: '资产',
        icon: 'chart',
        iconActive: 'chart-active'
      },
      {
        pagePath: '/pages/record/record',
        text: '记账',
        icon: 'add',
        iconActive: 'add-active',
        isCenter: true
      },
      {
        pagePath: '/pages/categories/categories',
        text: '分类',
        icon: 'category',
        iconActive: 'category-active'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        icon: 'member',
        iconActive: 'member-active'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = data.index;
      if (this.data.selected === index) return;
      wx.switchTab({ url });
    }
  }
});
