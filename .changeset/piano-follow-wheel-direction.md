---
'@strawberrybear/piano-roll': patch
'@strawberrybear/infinity-nikki-player': patch
---

将播放头跟随改为由明确输入驱动的横向浏览状态，移除 scroll 残差及小距离累计判断。只有横向滚轮或原生水平滚动条能进入临时浏览，实际横移达到四分之一视口后才关闭当前视图的跟随；纵向滚动、自动平移及延迟滚动通知只更新画面。统一处理临时浏览结束、尺寸变化、seek、缩放和销毁，并保留方向键的明确导航行为。同步播放器中英文操作帮助。
