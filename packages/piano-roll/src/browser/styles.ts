/** 浏览器控制器默认布局；按 ownerDocument 安装一次，无导入副作用。 */
export function installStyles(document: Document): void {
  if (document.querySelector('style[data-piano-roll]')) return
  const style = document.createElement('style')
  style.dataset.pianoRoll = ''
  style.textContent = `
.pr-view{display:grid;grid-template-columns:var(--pr-gutter,160px) minmax(0,1fr);grid-template-rows:32px minmax(0,1fr);height:100%;min-height:0;overflow:hidden;color:#e5e7eb;background:#202124;position:relative;font:12px system-ui,sans-serif;color-scheme:dark;contain:layout paint}
.pr-corner{background:#36373b;border-right:1px solid #151618;border-bottom:1px solid #151618;display:flex;align-items:center;padding:0 10px;overflow:hidden;white-space:nowrap}
.pr-ruler{position:relative;min-width:0;overflow:hidden;background:#36373b;touch-action:none;cursor:crosshair}
.pr-gutter{position:relative;min-height:0;overflow:hidden;background:#2b2c30;border-right:1px solid #151618;overscroll-behavior:contain}
.pr-pane{position:relative;min-width:0;min-height:0;overflow:hidden}
.pr-scroll{position:absolute;inset:0;z-index:2;overflow:scroll;overscroll-behavior:contain;outline-offset:-2px;scrollbar-width:auto}
.pr-scroll::-webkit-scrollbar{width:12px;height:12px}
.pr-scroll::-webkit-scrollbar-track,.pr-scroll::-webkit-scrollbar-corner{background:#25262a}
.pr-scroll::-webkit-scrollbar-thumb{background:#676970;border:3px solid #25262a;border-radius:7px}
.pr-scroll::-webkit-scrollbar-thumb:hover{background:#989ba3}
.pr-spacer{pointer-events:none;min-width:100%;min-height:100%}
.pr-layer{position:absolute;left:0;top:0;pointer-events:none;display:block}
.pr-line{position:absolute;top:0;bottom:0;width:1px;background:#f8fafc;pointer-events:none;z-index:3;box-shadow:0 0 2px #000}
.pr-handle{position:absolute;top:6px;left:0;margin-left:-9px;width:18px;height:25px;border:0;border-radius:4px 4px 1px 1px;background:#f8fafc;clip-path:polygon(0 0,100% 0,100% 65%,50% 100%,0 65%);cursor:ew-resize;touch-action:none;z-index:4;padding:0}
.pr-handle:focus-visible{background:#79b7ff;outline:2px solid #fff}
.pr-track{position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:10px;border-bottom:1px solid #17181a;background:#36373b}
.pr-track[data-selected=true]{background:#385a44;box-shadow:inset 3px 0 #82e198}
.pr-track-select{flex:1;min-width:0;border:0;background:none;color:inherit;cursor:pointer;text-align:left;padding:0;font:inherit}
.pr-track-select strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.pr-track-select small{display:block;opacity:.65;margin-top:6px}
.pr-track-toggle{border:1px solid #71717a;border-radius:4px;background:#52525b;color:#fff;cursor:pointer;padding:4px;font:inherit}
.pr-track-toggle[aria-pressed=false]{opacity:.4}
.pr-empty{position:absolute;inset:0;display:grid;place-items:center;color:#a1a1aa;pointer-events:none}
.pr-view [hidden]{display:none}
`
  document.head.append(style)
}
