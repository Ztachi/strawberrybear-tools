/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-09-08 00:57:07
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-09-09 00:36:01
 * @FilePath: /strawberrybear-tools/packages/piano-roll/src/browser/styles.ts
 * @Description: 
 */
/** 浏览器控制器默认布局；每个 ownerDocument 只持有一个节点，热更新时同步最新样式。 */
export function installStyles(document: Document): void {
  const style =
    document.querySelector<HTMLStyleElement>('style[data-piano-roll]') ??
    document.createElement('style')
  style.dataset.pianoRoll = ''
  style.textContent = `
.pr-view{display:grid;grid-template-columns:var(--pr-gutter,160px) minmax(0,1fr);grid-template-rows:32px minmax(0,1fr);height:100%;min-height:0;overflow:hidden;color:var(--pr-text,#4a3f3f);background:var(--pr-surface,#fff9fa);position:relative;font:12px var(--pr-font-family,system-ui,sans-serif);color-scheme:light;contain:layout paint}
.pr-corner{border-right:1px solid var(--pr-border,#f1d9de);border-bottom:1px solid var(--pr-border,#f1d9de);border-right-color:color-mix(in srgb,var(--pr-border,#f1d9de),transparent 34%);border-bottom-color:color-mix(in srgb,var(--pr-border,#f1d9de),transparent 34%);display:flex;align-items:center;padding:0 10px;overflow:hidden;white-space:nowrap}
.pr-ruler{position:relative;min-width:0;overflow:hidden;background:var(--pr-surface-raised,#fff1f4);touch-action:none;cursor:crosshair}
.pr-gutter{position:relative;min-height:0;overflow:hidden;background:var(--pr-surface-subtle,#fffafb);border-right:1px solid var(--pr-border,#f1d9de);border-right-color:color-mix(in srgb,var(--pr-border,#f1d9de),transparent 34%);overscroll-behavior:contain}
.pr-pane{position:relative;min-width:0;min-height:0;overflow:hidden}
.pr-scroll{position:absolute;inset:0;z-index:2;overflow-x:auto;overflow-y:scroll;overscroll-behavior:contain;outline-offset:-2px;scrollbar-width:auto;scrollbar-color:var(--pr-scrollbar-thumb,#e6a3af) var(--pr-surface-subtle,#fffafb)}
.pr-scroll::-webkit-scrollbar{width:12px;height:12px}
.pr-scroll::-webkit-scrollbar-track,.pr-scroll::-webkit-scrollbar-corner{background:var(--pr-surface-subtle,#fffafb)}
.pr-scroll::-webkit-scrollbar-thumb{background:var(--pr-scrollbar-thumb,#e6a3af);border:3px solid var(--pr-surface-subtle,#fffafb);border-radius:var(--pr-control-radius,6px)}
.pr-scroll::-webkit-scrollbar-thumb:hover{background:var(--pr-scrollbar-thumb-hover,#d97f91)}
.pr-spacer{pointer-events:none;min-width:100%;min-height:100%}
.pr-layer{position:absolute;left:0;top:0;pointer-events:none;display:block}
.pr-line{position:absolute;top:0;bottom:0;width:1px;background:var(--pr-playhead,#c9516b);pointer-events:none;z-index:3;box-shadow:0 0 2px var(--pr-border,#f1d9de)}
.pr-handle{position:absolute;top:6px;left:0;margin-left:-9px;width:18px;height:25px;border:0;border-radius:4px 4px 1px 1px;background:var(--pr-playhead-handle,#fff);clip-path:polygon(0 0,100% 0,100% 65%,50% 100%,0 65%);cursor:ew-resize;touch-action:none;z-index:4;padding:0}
.pr-handle:focus-visible{background:var(--pr-primary-soft,#f7b7be);outline:2px solid var(--pr-focus,#c9516b)}
.pr-track{position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--pr-border,#f1d9de);border-bottom-color:color-mix(in srgb,var(--pr-border,#f1d9de),transparent 46%);background:transparent}
.pr-track[data-selected=true]{background:color-mix(in srgb,var(--pr-track-selected,#ffe2e8),transparent 35%);box-shadow:inset 3px 0 var(--pr-primary,#e36f86)}
.pr-track-select{flex:1;min-width:0;border:0;background:none;color:inherit;cursor:pointer;text-align:left;padding:0;font:inherit}
.pr-track-label-host{display:block;min-width:0;overflow:hidden}
.piano-roll-track-name{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-track-select strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.pr-track-select small{display:block;opacity:.62;margin-top:3px}
.pr-track-toggle-host{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.pr-track-toggle{position:relative;display:inline-flex;align-items:center;justify-content:flex-start;flex:0 0 auto;box-sizing:border-box;width:34px;height:20px;padding:2px;border:1px solid var(--pr-track-disabled,#f4e4e7);border-radius:999px;background:var(--pr-track-disabled,#f4e4e7);cursor:pointer;color:var(--pr-primary,#e36f86);font:inherit}
.pr-track-toggle::after{content:"";display:block;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgb(74 63 63 / 22%);transform:translateX(0)}
.pr-track-toggle[aria-checked=true]{border-color:var(--pr-primary,#e36f86);background:var(--pr-primary,#e36f86)}
.pr-track-toggle[aria-checked=true]::after{transform:translateX(14px)}
.pr-track-toggle:hover{border-color:var(--pr-primary,#e36f86)}
.pr-track-toggle:focus-visible{outline:2px solid var(--pr-focus,#c9516b);outline-offset:2px}
.pr-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--pr-text-muted,#a89a9a);pointer-events:none}
.pr-view[data-variant=editor] .pr-corner{font-weight:600}
.pr-view[data-variant=editor] .pr-gutter{background:var(--pr-surface,#fff9fa)}
.pr-view[data-variant=editor] .pr-ruler{border-bottom:1px solid color-mix(in srgb,var(--pr-border,#f1d9de),transparent 30%)}
.pr-view [hidden]{display:none}
`
  if (!style.isConnected) document.head.append(style)
}
