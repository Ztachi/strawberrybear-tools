<script setup lang="ts">
/**
 * @description: CertificateWorkflowView - 证书办理流程页
 * @description 顶部承载稳定步骤导航，底部按当前步骤切换独立内容组件。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useScrollTopControl } from '@/composables/useScrollTopControl'
import WorkflowStepper from './components/WorkflowStepper/WorkflowStepper.vue'
import RegistrationStep from './components/RegistrationStep/RegistrationStep.vue'
import ProofingStep from './components/ProofingStep/ProofingStep.vue'
import SigningStep from './components/SigningStep/SigningStep.vue'
import CertificateStep from './components/CertificateStep/CertificateStep.vue'

type WorkflowRouteName = 'registration' | 'proofing' | 'signing' | 'certificate'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

useScrollTopControl({ scopeId: 'certificate-workflow-window', threshold: 180 })

const workflowSteps = computed(() => [
  {
    value: 1,
    routeName: 'registration' as const,
    title: t('workflow.registration'),
    subtitle: t('workflow.registrationDescription'),
    icon: 'mdi-account-edit-outline',
  },
  {
    value: 2,
    routeName: 'proofing' as const,
    title: t('workflow.proofing'),
    subtitle: t('workflow.proofingDescription'),
    icon: 'mdi-file-search-outline',
  },
  {
    value: 3,
    routeName: 'signing' as const,
    title: t('workflow.signing'),
    subtitle: t('workflow.signingDescription'),
    icon: 'mdi-seal-variant',
  },
  {
    value: 4,
    routeName: 'certificate' as const,
    title: t('workflow.certificate'),
    subtitle: t('workflow.certificateDescription'),
    icon: 'mdi-certificate-outline',
  },
])

const stepComponents = {
  registration: RegistrationStep,
  proofing: ProofingStep,
  signing: SigningStep,
  certificate: CertificateStep,
} as const

const currentRouteName = computed<WorkflowRouteName>(() => {
  const routeName = String(route.name ?? 'registration')
  return isWorkflowRouteName(routeName) ? routeName : 'registration'
})

const currentStep = computed(() => {
  return workflowSteps.value.find((step) => step.routeName === currentRouteName.value)?.value ?? 1
})

const maxReachableStep = ref(currentStep.value)

const currentStepComponent = computed(() => stepComponents[currentRouteName.value])

watch(
  currentStep,
  (step) => {
    maxReachableStep.value = Math.max(maxReachableStep.value, step)
  },
  { immediate: true }
)

/**
 * @description: 判断路由名是否属于证书办理流程
 * @param {string} routeName - 当前路由名
 * @return {boolean} 是否为流程路由
 */
function isWorkflowRouteName(routeName: string): routeName is WorkflowRouteName {
  return ['registration', 'proofing', 'signing', 'certificate'].includes(routeName)
}

/**
 * @description: 判断流程步骤是否可点击
 * @description 可点击范围基于本次会话已到达的最远步骤，而不是当前所在步骤。
 * @param {{ value: number }} step - 当前渲染的流程步骤
 * @return {boolean} 是否允许跳转
 */
function canNavigateStep(step: { value: number }): boolean {
  return step.value <= maxReachableStep.value
}

/**
 * @description: 跳转到流程步骤
 * @description 完成或已到达的步骤可往返切换，未到达的步骤不可越级。
 * @param {WorkflowRouteName} routeName - 目标流程路由名
 * @return {Promise<void>} 无返回值
 */
async function navigateStep(routeName: WorkflowRouteName): Promise<void> {
  const target = workflowSteps.value.find((step) => step.routeName === routeName)

  if (!target || !canNavigateStep(target)) {
    return
  }

  await router.push({ name: routeName })
}
</script>

<template>
  <div class="certificate-workflow">
    <section class="certificate-workflow__stepper-shell" :aria-label="t('workflow.label')">
      <WorkflowStepper
        :current-step="currentStep"
        :max-reachable-step="maxReachableStep"
        :steps="workflowSteps"
        @navigate="navigateStep"
      />
    </section>

    <section class="certificate-workflow__content" :aria-label="t('workflow.contentLabel')">
      <Transition name="workflow-step" mode="out-in" appear>
        <component :is="currentStepComponent" :key="currentRouteName" />
      </Transition>
    </section>
  </div>
</template>

<style scoped>
.certificate-workflow {
  min-height: calc(100dvh - 64px);
}

.certificate-workflow__stepper-shell {
  position: sticky;
  top: 64px;
  z-index: 12;
  container-type: scroll-state;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: clamp(10px, 1.8vw, 18px) clamp(16px, 4vw, 42px) 0;
}

.certificate-workflow__content {
  min-width: 0;
}

.workflow-step-enter-active,
.workflow-step-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.workflow-step-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.workflow-step-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .workflow-step-enter-active,
  .workflow-step-leave-active {
    transition: opacity 0.12s ease;
  }

  .workflow-step-enter-from,
  .workflow-step-leave-to {
    opacity: 0;
    transform: none;
  }
}
</style>
