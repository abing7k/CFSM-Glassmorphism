<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import { ALL_GROUPS } from '@/domain/dashboard'
import type { QuickControlKey } from '@/domain/theme-presentation'
import type { IconName } from '@/constants/icons'

/**
 * 对齐 Komari 首页控制行。
 *
 * 上游结构是「左侧可横向滚动的分组 Tabs + 快捷控制」与「右侧工具、
 * 视图切换、可折叠搜索框」两段，中间在 xl 断点才并排。
 *
 * 本 fork 只保留列表一种排布，因此控制区不再有卡片 / 列表切换按钮：
 * 一个只剩单选项的开关没有意义，去掉后右侧留出更多空间给搜索框。
 * 上游首页也没有排序下拉——列表排序由表头承担——因此这里同样不提供。
 */
const props = defineProps<{
  query: string
  group: string
  groups: string[]
  quickControlsEnabled: boolean
  quickControlKeys: QuickControlKey[]
  quickCounts: Partial<Record<QuickControlKey, number>>
  activeQuickFilter: QuickControlKey | null
  toolsAvailable: boolean
  toolsVisible: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:group': [value: string]
  'quickAction': [value: QuickControlKey]
  'toggleTools': []
}>()

const searchFocused = ref(false)
// 与上游一致：无内容且未聚焦时只保留图标宽度，聚焦或有内容才展开。
const searchExpanded = computed(() => searchFocused.value || props.query.length > 0)

const groupTabs = computed(() => [
  { value: ALL_GROUPS, label: '全部节点' },
  ...props.groups.map((item) => ({ value: item, label: item })),
])

const quickLabels: Record<QuickControlKey, { icon: IconName, label: string }> = {
  favorite: { icon: 'tabler:star', label: '收藏' },
  totalTraffic: { icon: 'tabler:chart-histogram', label: '总流量' },
  upload: { icon: 'tabler:arrow-big-up-lines', label: '上行' },
  download: { icon: 'tabler:arrow-big-down-lines', label: '下行' },
  peak: { icon: 'tabler:chart-line', label: '峰值' },
  offline: { icon: 'tabler:plug-connected-x', label: '离线' },
  highLoad: { icon: 'tabler:activity-heartbeat', label: '高负载' },
  expiring: { icon: 'tabler:calendar-exclamation', label: '即将到期' },
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function clearSearch(): void {
  emit('update:query', '')
}
</script>

<template>
  <section class="dashboard-controls" aria-label="节点筛选与布局">
    <div class="dashboard-controls__scroll">
      <div class="dashboard-controls__scroll-inner">
        <AppTabs
          class="group-tabs"
          list-label="节点分组"
          :items="groupTabs"
          :model-value="group"
          @update:model-value="emit('update:group', $event)"
        />

        <div v-if="quickControlsEnabled && quickControlKeys.length > 0" class="quick-controls">
          <button
            v-for="key in quickControlKeys"
            :key="key"
            type="button"
            :class="{ 'is-active': activeQuickFilter === key }"
            :aria-pressed="activeQuickFilter === key"
            :aria-label="`切换到${quickLabels[key].label}节点，${quickCounts[key] ?? 0} 台`"
            @click="emit('quickAction', key)"
          >
            <AppIcon :name="quickLabels[key].icon" :size="12" />
            <span>{{ quickLabels[key].label }}</span>
            <small>{{ quickCounts[key] ?? 0 }}</small>
          </button>
        </div>
      </div>
    </div>

    <div class="dashboard-controls__actions">
      <div v-if="toolsAvailable" class="tool-switch">
        <button
          type="button"
          :class="{ 'is-active': toolsVisible }"
          :aria-pressed="toolsVisible"
          aria-label="高级工具"
          title="高级工具"
          @click="emit('toggleTools')"
        >
          <AppIcon name="tabler:tools" :size="14" />
        </button>
      </div>

      <div class="search-field" :class="{ 'is-expanded': searchExpanded }">
        <AppIcon class="search-field__icon" name="tabler:search" :size="14" />
        <input
          type="search"
          :value="query"
          placeholder="搜索名称、分组、标签、地区、系统"
          aria-label="搜索节点"
          @input="emit('update:query', inputValue($event))"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
          @keydown.esc.prevent="clearSearch"
        >
        <button
          v-if="query"
          type="button"
          class="search-field__clear"
          aria-label="清空搜索"
          @click="clearSearch"
        >
          <AppIcon name="tabler:x" :size="14" />
        </button>
      </div>
    </div>
  </section>
</template>
