# 项目结构规范

## 目标

项目结构服务于职责边界，不是机械制造目录。路由入口、视图单元、feature、platform、bootstrap、共享 UI 逻辑、常量和公共包都应表达真实责任，让应用装配、局部展示和共享逻辑各自清楚。默认倾向是模块化、组件化、高复用和解耦，但抽取必须服务于清晰 owner，而不是制造空壳目录。

## Workspace

- `apps/<app>` 是独立应用边界，负责自己的运行时、平台适配、UI、后端、数据库、部署和验收。
- `packages/<package>` 是公共包边界，只承载跨应用稳定能力、平台无关算法、共享端口、协议 SDK、测试夹具或工程配置。
- 所有 workspace 应继承 `@strawberrybear/tsconfig`；应用级 `tsconfig.*.json` 只保留必要的 `paths`、`types`、`include` 等覆盖项。
- 公共包必须通过 `package.json` `exports` 暴露入口，应用和其他公共包不得穿透包内部文件。

## 源码导入与别名

- 能设置源码别名的 app workspace 必须在 TypeScript 配置和运行时工具配置中设置统一源码根别名；默认使用 `@` 指向当前 app 的源码根，例如 `src`、`src/client` 或框架等价目录。
- app 源码跨目录导入优先使用源码根别名，不用 `../..` 拼跨 owner 路径；例如路由导入页面写 `import Home from '@/pages/home'`，页面导入 store 写 `import { usePlayerStore } from '@/stores/player'`。
- 相对导入只用于同目录、同 owner 内部拆文件、页面私有组件、测试贴近源码的被测文件，或当前工具链无法稳定解析别名的场景。
- 公共包和 workspace 包仍通过包入口导入，例如 `@strawberrybear/player`；别名只表达当前 app 内部源码根，不替代公共包入口。
- 新增别名时必须同步配置类型检查、构建、测试和框架工具链，例如 `tsconfig` `paths`、Vite `resolve.alias`、Vitest `resolve.alias` 或对应框架配置。

## 应用源码

- `src/platform` 放平台 API、宿主 SDK、浏览器能力、服务端运行时或外部系统适配。
- `src/bootstrap` 放应用上下文创建、公共包实例装配、平台端口注入和状态桥接连接。
- `src/features` 放稳定业务能力入口；路由入口、视图组件和状态层优先通过 feature 入口消费能力，不穿透 feature 内部文件。
- 路由入口、页面或 screen 保持薄，只负责展示、交互、生命周期和路由级组合；业务编排优先进入 feature、状态桥接层或 app service。
- 应用如果包含 `src/client`、`src/server`、`src/shared`、`src/stores`、`src/views`、`src/pages`、`src/screens` 等目录，其语义和边界由应用自己的 `docs/` 补充。

## 视图单元层级

本节适用于以组件、页面、screen、view 或同类视图单元组织 UI 的工程。具体框架名称只用于示例映射，不能作为适用边界；任何同类技术栈都应按下面的职责和目录规则落地。

### 通用规则

- 路由入口、page、screen 或 view 必须进入应用声明的页面目录，例如 `src/views/`、`src/pages/`、`src/screens/`、`app/` 等；该目录根层不直接散放无归属的临时视图文件。
- 如果框架强制文件路由，路由文件保持薄，只做参数读取、权限或布局接入、路由级数据装配，然后把真实业务视图交给 `src/views/<Name>/<Name>.<ext>`、`src/screens/<Name>/<Name>.<ext>` 或应用声明的等价目录。
- 普通路由入口优先目录化：`views/A/A.<ext>`、`pages/A/A.<ext>`、`screens/A/A.<ext>` 或等价路径。不要把可增长页面长期堆在 `views/A.<ext>` 这类平铺文件中。
- 全局复用视图单元放在 `src/components/` 或应用声明的公共视图目录中；只被单个路由入口使用的子视图，放在该路由目录的 `components/` 下。
- 非路由视图单元没有子视图时可以保持单文件，例如 `components/A.<ext>`。
- 一旦非路由视图单元拥有自己的子视图，必须目录化为 `A/A.<ext>`，直接子视图放入 `A/components/B/B.<ext>`。
- 子视图继续拆分时递归使用同一规则，例如 `D/D.<ext>` 的直接子视图放在 `D/components/E/E.<ext>`。
- 页面私有子视图放在页面目录下的 `components/`，例如 `views/A/components/B/B.<ext>`；不要提升到全局 `components/`，除非已经有跨页面复用事实。
- 父视图优先负责路由动作、状态层协调、数据组合和组件编排；子视图维护自己的展示状态、局部交互和内部结构。
- 可增长的同构 UI 使用结构化数组和框架迭代语法驱动，例如 `map`、`v-for`、`{#each}` 或列表组件，不复制多段只改文案、图标或颜色的模板。

### 子视图拆分触发条件

出现以下情况时，应优先考虑拆成子视图，并让子视图拥有自己的目录、状态和样式边界：

- 某个 UI 区块拥有独立状态、生命周期、异步流程或局部交互，例如展开/收起、选择、编辑中、加载中、分页、拖拽、筛选、临时输入、局部缓存、动画阶段等。
- 某个 UI 区块可以用稳定业务名或界面名清楚命名，并且父视图只需要向它传入数据、配置或回调，不应该关心它的内部结构。
- 父视图同时承担路由动作、数据组合、多个交互区块和大量模板结构，继续堆叠会让父视图难以扫描和测试。
- 同类结构在当前页面内重复出现，或者预计会在多个页面、弹窗、列表项、卡片、工具栏、表单区块中复用。
- 某个区块的样式、布局、响应式、动画或视觉变体具有复用价值；CSS、原子 class、样式变量和布局结构都应和视图单元一起封装，而不是在多个父视图里复制。
- 某个区块需要单独测试、单独验收、单独替换组件库实现，或需要隔离平台差异。

子视图拆分后的状态 owner 按「离使用点最近」处理：只有该子视图内部使用的状态留在子视图；兄弟视图、父视图、路由或全局流程共同需要的状态再上提到父视图、feature、store 或平台端口。父视图负责把数据和动作编排清楚，子视图负责自己的展示状态、局部交互和内部样式。

不需要因为「可以拆」就拆：纯静态、无状态、无复用预期、没有清晰命名的短小片段，可以留在父视图；如果拆分会造成大量透传 props、事件绕路或职责更难理解，应先调整数据 owner 或抽取非视图逻辑，而不是机械创建组件。

### 目录映射示例

下面只是把通用规则映射到常见文件形态，不能理解成只支持这些框架。

```text
src/views/
  MusicDetail/
    MusicDetail.<ext>
    components/
      TrackList/
        TrackList.<ext>
        components/
          TrackRow/
            TrackRow.<ext>
src/components/
  GlobalPlayerBar/
    GlobalPlayerBar.<ext>
    components/
      PlayerButton/
        PlayerButton.<ext>
```

在单文件组件技术栈中，`<ext>` 可以是 `.vue`、`.svelte` 或同类文件：

```text
src/views/MusicDetail/MusicDetail.vue
src/views/MusicDetail/components/TrackList/TrackList.vue
src/views/MusicDetail/components/TrackList/components/TrackRow/TrackRow.vue
src/components/GlobalPlayerBar/GlobalPlayerBar.vue
```

在 TSX/JSX 或同类组件技术栈中，同一层级可映射为：

```text
src/screens/MusicDetail/MusicDetail.tsx
src/screens/MusicDetail/components/TrackList/TrackList.tsx
src/screens/MusicDetail/components/TrackList/components/TrackRow/TrackRow.tsx
src/components/GlobalPlayerBar/GlobalPlayerBar.tsx
```

在文件路由技术栈中，路由文件可以存在，但应保持薄：

```text
app/music/[id]/page.<ext>                 # 薄路由入口
src/views/MusicDetail/MusicDetail.<ext>   # 真实业务视图
src/views/MusicDetail/components/TrackList/TrackList.<ext>
```

## 共享 UI 逻辑

- hooks、composables、actions、stores 或同类共享 UI 逻辑只用于可复用逻辑、可复用副作用、跨组件状态协调，或复杂且有清晰语义边界的生命周期/异步流程。
- 单个视图单元内部的一次性状态、简单计算和纯展示交互，默认留在该视图单元内；如果这部分状态和一个可命名 UI 区块强绑定，应优先拆子视图让它自行管理，而不是把状态揉在父视图里。
- 路由入口私有逻辑如果不会复用，优先保留在 page/screen/view 或其私有视图单元中；只有显著降低复杂度或表达稳定业务概念时，再抽成共享 UI 逻辑。
- 当逻辑不依赖具体 UI 结构，且可被多个视图单元复用或独立测试时，再抽为 hook、composable、action、store helper 或同类共享逻辑。
- 全局共享逻辑放在应用声明的共享逻辑目录，例如 `src/hooks/`、`src/composables/`、`src/actions/`、`src/stores/` 或等价目录；页面私有逻辑放在页面目录内部，例如 `views/A/hooks/useAState.ts`、`views/A/composables/useAState.ts` 或等价路径。
- 文件和函数命名遵循当前技术栈约定；以 `use` 开头的 hook、composable 或同类函数必须返回状态和语义化 action。
- 有业务约束的副作用必须补充简短注释。

## 常量

- 应用内共享常量优先放在 `src/const/` 或应用约定的等价目录，按模块拆分，并由统一出口导出。
- 常量只承载跨路由入口、跨视图单元、跨状态层或跨 domain 的稳定业务事实；单个视图单元私有配置默认留在内部。
- 面向持久化、接口、编号或国际化的常量需要同时考虑机器字段与展示字段，例如 `id`、`code`、`number`、多语言 `name`。
- 关键业务常量需要测试兜底，至少校验数量、唯一性和关键默认值。
- 更完整规则见 [常量管理规范](constants.md)。

## 共享 TypeScript 配置

- 单仓库内应用应通过 workspace package 使用共享配置：在 app 的 `devDependencies` 中添加 `"@strawberrybear/tsconfig": "workspace:*"`。
- app 级 `tsconfig.*.json` 继承 `"@strawberrybear/tsconfig/base.json"`，只保留本应用必要的 `paths`、`types`、`include` 等覆盖项。
- `packages/tsconfig/package.json` 必须显式导出公共配置，例如 `"./base.json": "./base.json"`，避免 app 使用相对路径穿透包内部。

## 相关规范

- 通用 UI 原则、组件库优先级、图标、可访问性：[ui.md](ui.md)
- 启用 Tailwind 的应用：[tailwindcss.md](tailwindcss.md)
- 公共包边界：[public-packages.md](public-packages.md)
