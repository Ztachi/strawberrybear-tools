<script setup lang="ts">
/**
 * @description: WorkflowStepper - 证书办理步骤导航
 * @description 自定义流程条布局，避免第三方 Stepper 内部结构导致文字与连线重叠。
 */
export interface WorkflowStep {
  icon: string
  routeName: 'registration' | 'proofing' | 'signing' | 'certificate'
  subtitle: string
  title: string
  value: number
}

defineProps<{
  currentStep: number
  maxReachableStep: number
  steps: WorkflowStep[]
}>()

const emit = defineEmits<{
  navigate: [routeName: WorkflowStep['routeName']]
}>()

/**
 * @description: 判断步骤是否已完成
 * @param {number} stepValue - 步骤序号
 * @param {number} currentStep - 当前步骤序号
 * @return {boolean} 是否已完成
 */
function isComplete(stepValue: number, currentStep: number): boolean {
  return stepValue < currentStep
}

/**
 * @description: 判断步骤是否可访问
 * @param {number} stepValue - 步骤序号
 * @param {number} maxReachableStep - 已到达的最大步骤序号
 * @return {boolean} 是否可点击
 */
function isReachable(stepValue: number, maxReachableStep: number): boolean {
  return stepValue <= maxReachableStep
}
</script>

<template>
  <nav
    class="workflow-stepper relative isolate overflow-hidden rounded-[24px] border border-[#c48a2c]/25 bg-white/70 px-[clamp(18px,4vw,54px)] py-5 shadow-[0_18px_44px_rgba(201,85,126,0.12)] backdrop-blur max-[640px]:rounded-[20px] max-[640px]:px-4 max-[640px]:py-4"
  >
    <div
      class="pointer-events-none absolute inset-0 -z-[1] bg-[radial-gradient(circle_at_18%_16%,rgba(255,214,109,0.18),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(155,123,255,0.16),transparent_30%),linear-gradient(120deg,rgba(255,255,255,0.94),rgba(255,239,247,0.72))]"
    />

    <ol class="workflow-stepper__list relative grid grid-cols-4 gap-3 max-[640px]:gap-1.5">
      <li v-for="(step, index) in steps" :key="step.routeName" class="relative min-w-0">
        <span
          v-if="index < steps.length - 1"
          aria-hidden="true"
          :class="[
            'workflow-stepper__line absolute left-[calc(50%+26px)] right-[calc(-50%+26px)] top-[26px] h-px bg-[#c48a2c]/28 max-[640px]:left-[calc(50%+20px)] max-[640px]:right-[calc(-50%+20px)] max-[640px]:top-[22px]',
            step.value < maxReachableStep ? 'bg-[linear-gradient(90deg,#ef5f8f,#c48a2c)] opacity-70' : '',
          ]"
        />

        <v-tooltip>
          <template #activator="{ props }">
            <span v-bind="props" class="block">
              <button
                type="button"
                :disabled="!isReachable(step.value, maxReachableStep)"
                :aria-current="step.value === currentStep ? 'step' : undefined"
                class="workflow-stepper__button group relative z-[1] grid w-full min-w-0 justify-items-center gap-2 rounded-[18px] px-2 py-1.5 text-center transition duration-200 enabled:cursor-pointer enabled:hover:bg-white/55 enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-4 enabled:focus-visible:outline-[#ef5f8f]/55 disabled:cursor-not-allowed disabled:opacity-45 max-[640px]:gap-1.5 max-[640px]:px-1"
                data-sound="open"
                @click="emit('navigate', step.routeName)"
              >
                <span
                  :class="[
                    'workflow-stepper__icon relative grid size-[52px] place-items-center rounded-full border text-[24px] shadow-[0_10px_24px_rgba(239,95,143,0.14)] transition duration-200 max-[640px]:size-11 max-[640px]:text-[20px]',
                    step.value === currentStep
                      ? 'border-[#ef5f8f]/60 bg-[linear-gradient(135deg,#ef7aa8,#d93670)] text-white shadow-[0_16px_28px_rgba(239,95,143,0.28)]'
                      : 'border-[#c48a2c]/22 bg-white/80 text-[#5587e8]',
                    isComplete(step.value, currentStep) ? 'text-[#c48a2c]' : '',
                  ]"
                >
                  <v-icon :icon="step.icon" size="inherit" />
                  <span
                    v-if="isComplete(step.value, currentStep)"
                    class="workflow-stepper__check absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#ef5f8f] text-white shadow-[0_6px_12px_rgba(239,95,143,0.26)]"
                    aria-hidden="true"
                  >
                    <v-icon icon="mdi-check-bold" size="14" />
                  </span>
                </span>

                <span
                  class="workflow-stepper__meta grid min-w-0 max-w-[180px] gap-1 max-[640px]:max-w-[72px]"
                >
                  <strong
                    :class="[
                      'workflow-stepper__title text-[15px] font-[850] leading-snug tracking-normal text-[#3d527e] max-[640px]:text-[12px]',
                      step.value === currentStep ? 'text-[var(--color-primary-active)]' : '',
                    ]"
                  >
                    {{ step.title }}
                  </strong>
                  <small
                    class="workflow-stepper__subtitle text-[12px] font-[700] leading-snug tracking-normal text-[var(--color-muted-dark)] opacity-80 max-[900px]:hidden"
                  >
                    {{ step.subtitle }}
                  </small>
                </span>
              </button>
            </span>
          </template>
          <span>{{ step.title }} · {{ step.subtitle }}</span>
        </v-tooltip>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.workflow-stepper,
.workflow-stepper__line,
.workflow-stepper__button,
.workflow-stepper__icon,
.workflow-stepper__check,
.workflow-stepper__meta {
  transition:
    opacity 0.2s ease,
    max-height 0.2s ease,
    padding 0.2s ease,
    transform 0.2s ease,
    width 0.2s ease,
    height 0.2s ease,
    font-size 0.2s ease,
    box-shadow 0.2s ease,
    border-radius 0.2s ease;
}

.workflow-stepper__title,
.workflow-stepper__subtitle {
  overflow-wrap: anywhere;
  word-break: normal;
}

@container scroll-state(stuck: top) {
  .workflow-stepper {
    padding-top: 8px;
    padding-bottom: 8px;
    border-color: rgba(196, 138, 44, 0.34);
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 16px 34px rgba(201, 85, 126, 0.16);
  }

  .workflow-stepper__list {
    gap: clamp(4px, 2vw, 16px);
  }

  .workflow-stepper__button {
    gap: 0;
    padding-top: 2px;
    padding-bottom: 2px;
  }

  .workflow-stepper__icon {
    width: 42px;
    height: 42px;
    font-size: 20px;
    box-shadow: 0 8px 18px rgba(239, 95, 143, 0.16);
  }

  .workflow-stepper__check {
    width: 18px;
    height: 18px;
  }

  .workflow-stepper__meta {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateY(-4px);
  }

  .workflow-stepper__line {
    top: 21px;
  }
}
</style>
