// app.js
App({
  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d7gbyw7y75cf832e1', // 云环境 ID，请替换为你自己的环境 ID
        traceUser: false
      });
    }
    // 初始化数据（从云数据库拉取最新数据到本地缓存）
    const storage = require('./services/storageService');
    storage.init().then(() => {
      // 每月15日自动入账公积金（等数据同步完成后再入账，避免被云端数据覆盖）
      storage.autoCreditHousingFund();
      // 每月15日自动入账财产收入
      storage.autoCreditPropertyIncome();
      // 入账后把最新数据推送到云数据库
      storage.syncToCloud();
    });
  }
});
