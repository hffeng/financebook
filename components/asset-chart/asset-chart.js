// 自绘 Canvas 图表组件：支持折线图(line)和饼图(pie)
Component({
  properties: {
    // 图表类型：line | pie
    type: {
      type: String,
      value: 'line'
    },
    // 折线图数据：{ labels: [], values: [] }
    lineData: {
      type: Object,
      value: { labels: [], values: [] }
    },
    // 饼图数据：{ name, value, color }[]
    pieData: {
      type: Array,
      value: []
    },
    // 折线图颜色
    lineColor: {
      type: String,
      value: '#07C160'
    },
    // 金额隐藏（隐藏折线图末点数值标注）
    hideAmount: {
      type: Boolean,
      value: false
    },
    // 目标线金额（可选，>0 时画红色水平参考线）
    targetLine: {
      type: Number,
      value: 0
    }
  },
  data: {
    selectedIndex: -1
  },
  observers: {
    'type, lineData, pieData': function () {
      this.setData({ selectedIndex: -1 });
      this.drawChart();
    }
  },
  lifetimes: {
    ready() {
      this.drawChart();
    }
  },
  methods: {
    drawChart() {
      const query = this.createSelectorQuery();
      query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const width = res[0].width;
        const height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        if (this.data.type === 'pie') {
          this.drawPie(ctx, width, height);
        } else {
          this.drawLine(ctx, width, height);
        }
      });
    },
    drawLine(ctx, width, height) {
      const { labels, values } = this.data.lineData;
      if (!labels || labels.length === 0) {
        this.drawEmpty(ctx, width, height);
        return;
      }
      // Apple 风格：极简留白，无网格线、无 Y 轴刻度
      const padding = { top: 30, right: 20, bottom: 40, left: 20 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const lineColor = this.data.lineColor || '#07C160';

      // 计算最大最小值（目标线纳入范围，保证红线可见）
      const targetLine = this.data.targetLine || 0;
      let max = Math.max.apply(null, values);
      let min = Math.min.apply(null, values);
      if (targetLine > 0) {
        max = Math.max(max, targetLine);
        min = Math.min(min, targetLine);
      }
      if (max === min) { max = max + 1; min = min - 1; }
      const range = max - min;
      const padRange = range * 0.2;
      max = max + padRange;
      min = min - padRange;

      // 折线数据点
      const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;
      const points = values.map((v, i) => {
        const x = padding.left + stepX * i;
        const y = padding.top + chartH - ((v - min) / (max - min)) * chartH;
        return { x, y };
      });

      // 平滑曲线路径
      const smoothPath = this.smoothPath(points);

      // 极淡面积填充（Apple 风格：非常淡的渐变）
      const grad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      grad.addColorStop(0, this.hexToRgba(lineColor, 0.14));
      grad.addColorStop(0.55, this.hexToRgba(lineColor, 0.04));
      grad.addColorStop(1, this.hexToRgba(lineColor, 0));
      ctx.beginPath();
      smoothPath(ctx);
      ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
      ctx.lineTo(points[0].x, height - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 折线（Apple 风格：细而优雅，无重阴影）
      ctx.save();
      ctx.beginPath();
      smoothPath(ctx);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // 数据点（Apple 风格：仅末点高亮，中间点极淡）
      points.forEach((p, i) => {
        const isLast = i === points.length - 1;
        if (isLast) {
          // 末点：柔和光晕 + 实心点
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.fillStyle = this.hexToRgba(lineColor, 0.16);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = lineColor;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // 中间点：几乎不可见的小点
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = this.hexToRgba(lineColor, 0.35);
          ctx.fill();
        }
      });

      // 目标线（红色水平参考线，Apple 风格：细虚线 + 简洁标注）
      if (targetLine > 0) {
        const targetY = padding.top + chartH - ((targetLine - min) / (max - min)) * chartH;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 77, 79, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding.left, targetY);
        ctx.lineTo(width - padding.right, targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        // 目标线金额标注（右侧简洁胶囊）
        const labelText = this.data.hideAmount ? '****' : this.formatNum(targetLine);
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(labelText).width;
        const boxW = tw + 14;
        const boxH = 18;
        let bx = width - padding.right - boxW;
        if (bx < padding.left) bx = padding.left;
        let by = targetY - boxH - 6;
        if (by < 4) by = targetY + 6;
        ctx.beginPath();
        this.roundRect(ctx, bx, by, boxW, boxH, 9);
        ctx.fillStyle = '#FF4D4F';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, bx + boxW / 2, by + boxH / 2 + 1);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }

      // 末点：当前值标注（Apple 风格：简洁数值）
      const last = points[points.length - 1];
      const lastVal = values[values.length - 1];
      this.drawValueLabel(ctx, last.x, last.y, lastVal, lineColor, padding, width);

      // 选中点（非末点）：显示该点金额标注
      const selIdx = this.data.selectedIndex;
      if (selIdx >= 0 && selIdx < points.length && selIdx !== points.length - 1) {
        this.drawValueLabel(ctx, points[selIdx].x, points[selIdx].y, values[selIdx], lineColor, padding, width);
      }

      // X 轴标签（Apple 风格：更淡、更小、更精致）
      ctx.fillStyle = '#C2C8CE';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const labelStep = Math.ceil(labels.length / 6);
      labels.forEach((label, i) => {
        if (i % labelStep !== 0 && i !== labels.length - 1) return;
        ctx.fillText(label, points[i].x, height - padding.bottom + 20);
      });
    },
    drawPie(ctx, width, height) {
      const data = this.data.pieData || [];
      const total = data.reduce((s, d) => s + d.value, 0);
      if (total <= 0) {
        this.drawEmpty(ctx, width, height);
        return;
      }
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 20;

      let startAngle = -Math.PI / 2;
      const gap = 0.02; // 扇区间隙
      data.forEach((d, i) => {
        const angle = (d.value / total) * Math.PI * 2;
        const drawAngle = Math.max(angle - gap, 0.01);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle + gap / 2, startAngle + gap / 2 + drawAngle);
        ctx.closePath();
        ctx.fillStyle = d.color || '#999999';
        ctx.fill();
        startAngle += angle;
      });

      // 中心空白（环形图效果）
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // 中心显示选中分类的名称和金额
      const idx = this.data.selectedIndex;
      if (idx >= 0 && idx < data.length) {
        const sel = data[idx];
        const innerR = radius * 0.55;
        ctx.fillStyle = sel.color || '#333333';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sel.name || '', cx, cy - innerR * 0.25);
        const amountText = this.data.hideAmount ? '****' : this.formatAmount(sel.value);
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(amountText, cx, cy + innerR * 0.3);
        ctx.textBaseline = 'alphabetic';
      } else {
        // 中心装饰圆点
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = '#F0F2F0';
        ctx.fill();
      }
    },
    // 点击图表：饼图根据角度判断扇区，折线图根据距离判断数据点
    onCanvasTap(e) {
      const query = this.createSelectorQuery();
      query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const width = res[0].width;
        const height = res[0].height;
        const touch = e.touches && e.touches[0] ? e.touches[0] : e.detail;
        const x = touch.x;
        const y = touch.y;

        if (this.data.type === 'pie') {
          this.handlePieTap(x, y, width, height);
        } else {
          this.handleLineTap(x, y, width, height);
        }
      });
    },
    // 饼图点击：根据角度判断命中的扇区
    handlePieTap(x, y, width, height) {
      const data = this.data.pieData || [];
      const total = data.reduce((s, d) => s + d.value, 0);
      if (total <= 0 || data.length === 0) return;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 20;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 点击在环形区域（扇区）内才响应
      if (dist < radius * 0.55 || dist > radius) return;
      // 计算角度（与绘制一致：从 -90° 顺时针）
      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      const rel = angle + Math.PI / 2;
      let acc = 0;
      let hit = -1;
      for (let i = 0; i < data.length; i++) {
        const slice = (data[i].value / total) * Math.PI * 2;
        if (rel >= acc && rel < acc + slice) {
          hit = i;
          break;
        }
        acc += slice;
      }
      if (hit >= 0) {
        this.setData({ selectedIndex: hit });
        this.drawChart();
      }
    },
    // 折线图点击：根据距离判断命中的数据点
    handleLineTap(x, y, width, height) {
      const { labels, values } = this.data.lineData;
      if (!labels || labels.length === 0) return;
      const padding = { top: 30, right: 20, bottom: 40, left: 20 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      let max = Math.max.apply(null, values);
      let min = Math.min.apply(null, values);
      if (max === min) { max = max + 1; min = min - 1; }
      const range = max - min;
      const padRange = range * 0.2;
      max = max + padRange;
      min = min - padRange;
      const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;
      // 找到距离点击位置最近的数据点
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < values.length; i++) {
        const px = padding.left + stepX * i;
        const py = padding.top + chartH - ((values[i] - min) / (max - min)) * chartH;
        const dist = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      // 距离阈值内才选中（避免误触）
      if (best >= 0 && bestDist <= 24) {
        this.setData({ selectedIndex: best });
        this.drawChart();
      }
    },
    // 折线图滑动：根据 x 坐标实时选中最近的数据点并显示金额
    onCanvasTouchMove(e) {
      if (this.data.type !== 'line') return;
      const query = this.createSelectorQuery();
      query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const width = res[0].width;
        const height = res[0].height;
        const touch = e.touches && e.touches[0] ? e.touches[0] : e.detail;
        const x = touch.x;
        const y = touch.y;
        this.selectLinePoint(x, y, width, height);
      });
    },
    // 折线图滑动结束：清除选中状态
    onCanvasTouchEnd() {
      if (this.data.type !== 'line') return;
      if (this.data.selectedIndex !== -1) {
        this.setData({ selectedIndex: -1 });
        this.drawChart();
      }
    },
    // 根据触摸位置选中折线图最近的数据点（滑动时实时更新）
    selectLinePoint(x, y, width, height) {
      const { labels, values } = this.data.lineData;
      if (!labels || labels.length === 0) return;
      const padding = { top: 30, right: 20, bottom: 40, left: 20 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      let max = Math.max.apply(null, values);
      let min = Math.min.apply(null, values);
      const targetLine = this.data.targetLine || 0;
      if (targetLine > 0) {
        max = Math.max(max, targetLine);
        min = Math.min(min, targetLine);
      }
      if (max === min) { max = max + 1; min = min - 1; }
      const range = max - min;
      const padRange = range * 0.2;
      max = max + padRange;
      min = min - padRange;
      const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;
      // 根据 x 坐标找到最近的数据点（滑动时主要看横向位置）
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < values.length; i++) {
        const px = padding.left + stepX * i;
        const py = padding.top + chartH - ((values[i] - min) / (max - min)) * chartH;
        const dist = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (best >= 0 && best !== this.data.selectedIndex) {
        this.setData({ selectedIndex: best });
        this.drawChart();
      }
    },
    // 在指定点绘制金额标注标签（Apple 风格：简洁圆角标签 + 小三角 + 文字）
    drawValueLabel(ctx, x, y, value, color, padding, width) {
      const labelText = this.data.hideAmount ? '****' : this.formatNum(value);
      ctx.font = 'bold 10px sans-serif';
      const tw = ctx.measureText(labelText).width;
      const boxW = tw + 12;
      const boxH = 19;
      let bx = x - boxW / 2;
      if (bx < padding.left - 4) bx = padding.left - 4;
      if (bx + boxW > width - padding.right + 4) bx = width - padding.right + 4 - boxW;
      let by = y - boxH - 11;
      if (by < 4) by = y + 13; // 顶部空间不足时放到点下方
      // 圆角标签背景
      ctx.beginPath();
      this.roundRect(ctx, bx, by, boxW, boxH, 9.5);
      ctx.fillStyle = color;
      ctx.fill();
      // 小三角
      ctx.beginPath();
      ctx.moveTo(x - 4, by + boxH);
      ctx.lineTo(x + 4, by + boxH);
      ctx.lineTo(x, by + boxH + 4);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // 标签文字
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, bx + boxW / 2, by + boxH / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    },
    formatAmount(n) {
      if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
      return Math.round(n).toString();
    },
    drawEmpty(ctx, width, height) {
      ctx.fillStyle = '#CCCCCC';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', width / 2, height / 2);
    },
    // 生成平滑贝塞尔曲线路径
    // 对连续水平段（相邻点 y 相同）保持直线，避免被后续变化点拉弯
    smoothPath(points) {
      return (ctx) => {
        if (points.length === 0) return;
        if (points.length === 1) {
          ctx.moveTo(points[0].x, points[0].y);
          return;
        }
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i - 1] || points[i];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[i + 2] || p2;
          // 控制点 x 始终按 Catmull-Rom 计算
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          // 控制点 y：若当前段水平（p1.y === p2.y），保持水平，避免被后续变化点拉弯
          let cp1y = p1.y + (p2.y - p0.y) / 6;
          let cp2y = p2.y - (p3.y - p1.y) / 6;
          if (p1.y === p2.y) {
            cp1y = p1.y;
            cp2y = p2.y;
          }
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
      };
    },
    formatNum(n) {
      if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + 'w';
      if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
      return Math.round(n).toString();
    },
    // 绘制圆角矩形路径
    roundRect(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    hexToRgba(hex, alpha) {
      let h = hex.replace('#', '');
      if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
      }
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
  }
});
