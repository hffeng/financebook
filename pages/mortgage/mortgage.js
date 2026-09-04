const { formatAmount } = require('../../utils/formatUtil');
const storage = require('../../services/storageService');

// 上海最新房贷政策利率（按中国人民银行公布的利率及差别化政策执行）
const GJJ_RATE_OPTIONS = [
  { label: '首套 · 5年以上 · 2.60%', value: '2.60' },
  { label: '二套 · 5年以上 · 3.075%', value: '3.075' }
];

const COMMERCIAL_RATE_OPTIONS = [
  { label: '首套 · 3.15%', value: '3.15' },
  { label: '二套 · 3.55%', value: '3.55' }
];

// 上海公积金贷款额度上限（最新政策）
const GJJ_AMOUNT_OPTIONS = [
  { label: '首套 · 单人最高 120万', value: '120' },
  { label: '首套 · 家庭最高 240万', value: '240' },
  { label: '二套 · 单人最高 100万', value: '100' },
  { label: '二套 · 家庭最高 200万', value: '200' }
];

Page({
  data: {
    loanType: 'gjj',
    // 公积金贷款金额（万元）：公积金贷款 / 组合贷款共用
    gjjLoanAmount: '200',
    gjjAmountOptions: GJJ_AMOUNT_OPTIONS,
    gjjAmountIndex: 3,
    // 商业贷款金额（万元）：商业贷款 / 组合贷款共用
    commercialLoanAmount: '400',
    // 组合贷款总金额（万元）
    combinedTotalAmount: '600',
    years: 30,
    yearOptions: [1, 5, 10, 15, 20, 25, 30],
    // 公积金贷款利率
    rateOptions: GJJ_RATE_OPTIONS,
    rateIndex: 0,
    rateInput: '',
    // 商业贷款利率
    commercialRateOptions: COMMERCIAL_RATE_OPTIONS,
    commercialRateIndex: 0,
    commercialRateInput: '',
    manual: { gjjAmount: false, rate: false, commercialRate: false },
    method: 'debx',
    calculated: false,
    monthlyText: '0',
    actualMonthlyText: '0',
    housingFundTotalText: '0',
    propertyIncomeTotalText: '0',
    propertyExpenseTotalText: '0',
    firstMonthText: '0',
    totalLoanText: '0',
    totalInterestText: '0',
    totalPaymentText: '0',
    decreaseText: '0',
    months: 0
  },

  onShow() {
    // 迁移历史脏数据：旧版本只有一个 mortgageRate 键，存的是商贷利率。
    // 若存在旧值且尚无独立的商贷利率，则把旧值迁移到商贷利率并清空公积金利率，
    // 避免商贷利率被错误地应用到公积金利率上。
    const legacyRate = storage.getMortgageRate();
    const lastCommercialRate = storage.getMortgageCommercialRate();
    if (legacyRate && !lastCommercialRate) {
      storage.setMortgageCommercialRate(legacyRate);
      storage.setMortgageRate('');
    }

    const patch = {};
    // 公积金利率与商业贷款利率字段相互独立，各自应用存储值。
    // 公积金利率使用独立键 mortgageGjjRate，彻底隔离历史遗留的 mortgageRate 脏数据。
    const gjjRate = storage.getMortgageGjjRate();
    if (gjjRate) {
      // 若存储值匹配下拉选项，则恢复下拉选择框的选中索引；否则视为手动输入值
      const idx = this.data.rateOptions.findIndex(o => o.value === gjjRate);
      if (idx > -1) {
        patch.rateIndex = idx;
      } else {
        patch.rateInput = gjjRate;
        patch['manual.rate'] = true;
      }
    }
    const commercialRate = storage.getMortgageCommercialRate();
    if (commercialRate) {
      patch.commercialRateInput = commercialRate;
      patch['manual.commercialRate'] = true;
    }
    // 加载上次输入的贷款金额（公积金 / 商业 / 组合总金额，单位：万元）
    const gjjAmount = storage.getMortgageGjjAmount();
    if (gjjAmount) {
      patch.gjjLoanAmount = gjjAmount;
      // 同步下拉选择框的选中索引，使下拉选择框与存储值一致
      const idx = this.data.gjjAmountOptions.findIndex(o => o.value === gjjAmount);
      if (idx > -1) {
        patch.gjjAmountIndex = idx;
      }
    }
    const commercialAmount = storage.getMortgageCommercialAmount();
    if (commercialAmount) {
      patch.commercialLoanAmount = commercialAmount;
    }
    const combinedTotal = storage.getMortgageCombinedTotal();
    if (combinedTotal) {
      patch.combinedTotalAmount = combinedTotal;
    }
    if (Object.keys(patch).length) {
      this.setData(patch);
    }
  },

  onLoanTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    const patch = { loanType: type };
    // 切换贷款类型时清空计算结果
    patch.calculated = false;
    patch.monthlyText = '0';
    patch.actualMonthlyText = '0';
    patch.housingFundTotalText = '0';
    patch.propertyIncomeTotalText = '0';
    patch.propertyIncomeDisplay = '';
    patch.firstMonthText = '0';
    patch.totalLoanText = '0';
    patch.totalInterestText = '0';
    patch.totalPaymentText = '0';
    patch.decreaseText = '0';
    patch.months = 0;
    this.setData(patch);
  },

  onRateChange(e) {
    const index = Number(e.detail.value);
    this.setData({ rateIndex: index });
    // 保存选中的公积金利率，下次进入时恢复下拉选择框的选中项
    const rate = this.data.rateOptions[index].value;
    storage.setMortgageGjjRate(rate);
  },

  onCommercialRateChange(e) {
    this.setData({ commercialRateIndex: Number(e.detail.value) });
  },

  onGjjAmountChange(e) {
    const index = Number(e.detail.value);
    const gjj = this.data.gjjAmountOptions[index].value;
    const patch = {
      gjjAmountIndex: index,
      gjjLoanAmount: gjj
    };
    // 更新公积金金额时，总金额 = 公积金 + 商业（商业不变）
    const commercial = parseFloat(this.data.commercialLoanAmount) || 0;
    if (parseFloat(gjj) > 0 && commercial > 0) {
      patch.combinedTotalAmount = this.fmtWan(parseFloat(gjj) + commercial);
    }
    this.setData(patch);
  },

  onToggleManual(e) {
    const field = e.currentTarget.dataset.field;
    const current = this.data.manual[field];
    const patch = {};
    patch['manual.' + field] = !current;
    // 切换到手动输入时，预填当前选中值
    if (!current) {
      if (field === 'rate') {
        patch.rateInput = this.data.rateOptions[this.data.rateIndex].value;
      } else if (field === 'commercialRate') {
        patch.commercialRateInput = this.data.commercialRateOptions[this.data.commercialRateIndex].value;
      } else if (field === 'gjjAmount') {
        patch.gjjLoanAmount = this.data.gjjAmountOptions[this.data.gjjAmountIndex].value;
      }
    }
    this.setData(patch);
  },

  onMethodChange(e) {
    const method = e.currentTarget.dataset.method;
    this.setData({ method }, () => {
      this.onCalc();
    });
  },

  onYearsChange(e) {
    this.setData({ years: Number(e.currentTarget.dataset.years) });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const patch = { [field]: value };
    // 三个金额（公积金 / 商业 / 组合总金额）双向联动，不依赖当前贷款类型：
    // - 修改公积金：总金额 = 公积金 + 商业（商业不变）
    // - 修改商业：总金额 = 公积金 + 商业（公积金不变）
    // - 修改总金额：商业 = 总金额 - 公积金（公积金不变）
    if (field === 'combinedTotalAmount') {
      const total = parseFloat(value) || 0;
      const gjj = parseFloat(this.data.gjjLoanAmount) || 0;
      if (total > 0 && gjj > 0) {
        patch.commercialLoanAmount = this.fmtWan(total - gjj);
      }
    } else if (field === 'gjjLoanAmount') {
      const gjj = parseFloat(value) || 0;
      const commercial = parseFloat(this.data.commercialLoanAmount) || 0;
      if (gjj > 0 && commercial > 0) {
        patch.combinedTotalAmount = this.fmtWan(gjj + commercial);
      }
    } else if (field === 'commercialLoanAmount') {
      const gjj = parseFloat(this.data.gjjLoanAmount) || 0;
      const commercial = parseFloat(value) || 0;
      if (gjj > 0 && commercial > 0) {
        patch.combinedTotalAmount = this.fmtWan(gjj + commercial);
      }
    }
    this.setData(patch);
  },

  onCalc() {
    const { loanType, gjjLoanAmount, commercialLoanAmount, years, method, rateOptions, rateIndex, commercialRateOptions, commercialRateIndex, manual, rateInput, commercialRateInput } = this.data;
    const rate = manual.rate ? rateInput : rateOptions[rateIndex].value;
    const commercialRate = manual.commercialRate ? commercialRateInput : commercialRateOptions[commercialRateIndex].value;
    const months = years * 12;

    let totalLoan = 0;
    let totalInterest = 0;
    let firstMonth = 0;
    let monthly = 0;
    let decrease = 0;

    if (loanType === 'combined') {
      // 组合贷款：公积金部分 + 商业部分
      const gjjWan = parseFloat(gjjLoanAmount) || 0;
      const commercialWan = parseFloat(commercialLoanAmount) || 0;
      if (gjjWan <= 0 || commercialWan <= 0) {
        wx.showToast({ title: '请输入有效的公积金和商业贷款金额', icon: 'none' });
        return;
      }
      const r1 = parseFloat(rate) / 100 / 12;
      const r2 = parseFloat(commercialRate) / 100 / 12;
      const res1 = this.calcPart(gjjWan * 10000, months, r1, method);
      const res2 = this.calcPart(commercialWan * 10000, months, r2, method);
      totalLoan = gjjWan * 10000 + commercialWan * 10000;
      totalInterest = res1.interest + res2.interest;
      monthly = res1.monthly + res2.monthly;
      firstMonth = res1.firstMonth + res2.firstMonth;
      decrease = res1.decrease + res2.decrease;
    } else if (loanType === 'commercial') {
      // 商业贷款：使用独立的商业贷款金额和商业贷款利率
      const commercialWan = parseFloat(commercialLoanAmount) || 0;
      if (commercialWan <= 0) {
        wx.showToast({ title: '请输入商业贷款金额', icon: 'none' });
        return;
      }
      const r = parseFloat(commercialRate) / 100 / 12;
      if (!r || r < 0) {
        wx.showToast({ title: '请输入有效的商业贷款利率', icon: 'none' });
        return;
      }
      const res = this.calcPart(commercialWan * 10000, months, r, method);
      totalLoan = commercialWan * 10000;
      totalInterest = res.interest;
      monthly = res.monthly;
      firstMonth = res.firstMonth;
      decrease = res.decrease;
    } else {
      // 公积金贷款：使用独立的公积金贷款金额和公积金贷款利率
      const gjjWan = parseFloat(gjjLoanAmount) || 0;
      if (gjjWan <= 0) {
        wx.showToast({ title: '请输入公积金贷款金额', icon: 'none' });
        return;
      }
      const r = parseFloat(rate) / 100 / 12;
      if (!r || r < 0) {
        wx.showToast({ title: '请输入有效的公积金贷款利率', icon: 'none' });
        return;
      }
      const res = this.calcPart(gjjWan * 10000, months, r, method);
      totalLoan = gjjWan * 10000;
      totalInterest = res.interest;
      monthly = res.monthly;
      firstMonth = res.firstMonth;
      decrease = res.decrease;
    }

    // 保存手动输入的利率（同步到云，下次计算时默认填充，其他用户也能看到）
    if (manual.rate && rateInput) {
      storage.setMortgageGjjRate(rateInput);
    }
    if (manual.commercialRate && commercialRateInput) {
      storage.setMortgageCommercialRate(commercialRateInput);
    }

    // 保存贷款金额（下次进入时默认填充）
    if (gjjLoanAmount) {
      storage.setMortgageGjjAmount(gjjLoanAmount);
    }
    if (commercialLoanAmount) {
      storage.setMortgageCommercialAmount(commercialLoanAmount);
    }
    if (this.data.combinedTotalAmount) {
      storage.setMortgageCombinedTotal(this.data.combinedTotalAmount);
    }

    // 实际月供 = 月供 - 成员公积金之和 - 财产收入 + 财产支出
    const housingFundTotal = storage.getMemberHousingFundTotal();
    const propertyIncomeTotal = storage.getMemberPropertyIncomeTotal();
    const propertyExpenseTotal = storage.getMemberPropertyExpenseTotal();
    const actualMonthly = Math.max(0, monthly - housingFundTotal - propertyIncomeTotal + propertyExpenseTotal);

    // 展示明细：收入为正则减，支出为正则加，两者分别展示
    let propertyIncomeDisplay = '';
    if (propertyIncomeTotal > 0) {
      propertyIncomeDisplay += '- 财产收入 ¥' + formatAmount(propertyIncomeTotal);
    }
    if (propertyExpenseTotal > 0) {
      propertyIncomeDisplay += (propertyIncomeDisplay ? ' ' : '') + '+ 财产支出 ¥' + formatAmount(propertyExpenseTotal);
    }

    this.setData({
      calculated: true,
      months,
      monthlyText: formatAmount(monthly),
      actualMonthlyText: formatAmount(actualMonthly),
      housingFundTotalText: formatAmount(housingFundTotal),
      propertyIncomeTotalText: formatAmount(propertyIncomeTotal),
      propertyExpenseTotalText: formatAmount(propertyExpenseTotal),
      propertyIncomeDisplay,
      firstMonthText: formatAmount(firstMonth),
      totalLoanText: formatAmount(totalLoan),
      totalInterestText: formatAmount(totalInterest),
      totalPaymentText: formatAmount(totalLoan + totalInterest),
      decreaseText: formatAmount(decrease)
    });
  },

  // 格式化万元数值（保留最多两位小数，去掉多余的 0）
  fmtWan(num) {
    if (isNaN(num)) return '';
    const rounded = Math.round(num * 100) / 100;
    return String(rounded);
  },

  // 计算单笔贷款：等额本息 / 等额本金
  calcPart(principal, months, monthlyRate, method) {
    if (method === 'debj') {
      // 等额本金：每月还固定本金，利息逐月递减
      const principalPerMonth = principal / months;
      const firstInterest = principal * monthlyRate;
      const firstMonth = principalPerMonth + firstInterest;
      // 总利息 = 每月剩余本金 * 月利率 之和
      let interest = 0;
      for (let i = 0; i < months; i++) {
        const remaining = principal - principalPerMonth * i;
        interest += remaining * monthlyRate;
      }
      // 每月递减金额 = 每月本金 × 月利率
      const decrease = principalPerMonth * monthlyRate;
      return { monthly: firstMonth, firstMonth, interest, decrease };
    }
    // 等额本息
    if (monthlyRate === 0) {
      const monthly = principal / months;
      return { monthly, firstMonth: monthly, interest: 0, decrease: 0 };
    }
    const factor = Math.pow(1 + monthlyRate, months);
    const monthly = principal * monthlyRate * factor / (factor - 1);
    const totalPayment = monthly * months;
    return { monthly, firstMonth: monthly, interest: totalPayment - principal, decrease: 0 };
  }
});
