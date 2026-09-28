<script setup lang="ts">
import { computed } from 'vue'
import type { GlassServer } from '@/types/glassmorphism'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppProgressThin from '@/components/ui/AppProgressThin.vue'
import { resolveRegionCoordinates } from '@/domain/advanced-tools'
import {
  matchProvider,
  trafficUsageBytes,
  type ProviderAlias,
} from '@/domain/theme-presentation'
import { flagUrl, hideMissingFlag } from '@/utils/flags'
import { osDisplayName, osIconUrl } from '@/utils/os-icon'
import { usageStatus } from '@/utils/progress-status'
import {
  formatDisplayBytes,
  formatDisplayPrice,
  formatDisplaySpeed,
  formatPercent,
  formatUptime,
  MISSING_TEXT,
} from '@/utils/format'

/**
 * 对齐 Komari `NodeList` 的节点列表。
 *
 * 与上游一致，采用 CSS 栅格行而不是语义化表格标签：
 * 状态 / 系统 / 节点 / 信息 / 运行时间 / CPU / 内存 / 硬盘 / 流量 / 速率。
 * 「信息」列受 `nodeListMetadataEnabled` 控制，与 Komari 的列过滤行为相同。
 * 行主点击直接进入详情，收藏按钮 stopPropagation。
 */
const props = defineProps<{
  servers: GlassServer[]
  showSource: boolean
  favoriteKeys: ReadonlySet<string>
  metadataEnabled: boolean
  metadataFields: string[]
  customTagsVisible: boolean
  providerAliases: ProviderAlias[]
  priceVisible: boolean
}>()

const emit = defineEmits<{
  open: [server: GlassServer]
  toggleFavorite: [key: string]
}>()

interface ListColumn {
  key: string
  label: string
  width: string
  align?: 'left' | 'center' | 'right'
}

const BASE_COLUMNS: readonly ListColumn[] = [
  { key: 'status', label: '状态', width: '40px', align: 'center' },
  { key: 'os', label: '系统', width: '44px', align: 'center' },
  { key: 'name', label: '节点', width: 'minmax(150px, 0.9fr)', align: 'left' },
  { key: 'metadata', label: '国家', width: 'minmax(96px, 0.6fr)', align: 'center' },
  { key: 'uptime', label: '运行时间', width: '104px', align: 'center' },
  { key: 'cpu', label: 'CPU', width: '92px', align: 'center' },
  { key: 'mem', label: '内存', width: '92px', align: 'center' },
  { key: 'disk', label: '硬盘', width: '92px', align: 'center' },
  { key: 'rate', label: '实时网速', width: '96px', align: 'center' },
  { key: 'monthly', label: '本月流量', width: '92px', align: 'center' },
  { key: 'total', label: '总流量', width: '92px', align: 'center' },
]

const columns = computed(() => BASE_COLUMNS.filter(
  (column) => column.key !== 'metadata' || props.metadataEnabled,
))
const gridStyle = computed(() => ({
  gridTemplateColumns: columns.value.map((column) => column.width).join(' '),
}))

function columnAlign(key: string): string {
  const column = BASE_COLUMNS.find((item) => item.key === key)
  return `node-list__col--${column?.align ?? 'left'}`
}

function ratio(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null
  return Math.min(100, Math.max(0, (used / total) * 100))
}

function regionCode(server: GlassServer): string | null {
  return resolveRegionCoordinates(server.region)?.code ?? null
}

function priceText(server: GlassServer): string {
  if (!props.priceVisible || !server.showPrice) return ''
  const text = formatDisplayPrice(server.price, server.currency, server.billingCycle)
  return text === MISSING_TEXT ? '' : text
}

interface MetadataBadge {
  key: string
  value: string
  flag?: string
}

/** 只展示 CFSM 真实存在的元数据；provider 仅按用户声明的别名做文本匹配。 */
function metadataBadges(server: GlassServer): MetadataBadge[] {
  const fields = new Set(props.metadataFields)
  const badges: MetadataBadge[] = []

  if (fields.has('provider')) {
    const provider = matchProvider(server, props.providerAliases)
    if (provider) badges.push({ key: 'provider', value: provider })
  }
  if (fields.has('region') && server.region) {
    const code = regionCode(server)
    badges.push({ key: 'region', value: server.region, ...(code ? { flag: flagUrl(code) } : {}) })
  }
  if (fields.has('group') && server.group) {
    badges.push({ key: 'group', value: server.group })
  }
  if (props.showSource) {
    badges.push({ key: 'source', value: server.sourceLabel })
  }
  if (props.customTagsVisible && fields.has('tags')) {
    for (const tag of server.tags) badges.push({ key: `tag:${tag}`, value: tag })
  }

  return badges
}

/*
 * 两列流量与总览卡片保持同一口径：
 * - 「本月流量」读计费周期内的月度计数，按 CFSM 的 `traffic_calc_type` 合计；
 * - 「总流量」读网卡累计计数（`network.received + transmitted`），与站点开关无关，
 *   因为它是探针自启动以来的真实累计值，不是配额用量。
 * 两列都只呈现真实数字，缺失时给占位符。
 */
function monthlyTrafficText(server: GlassServer): string {
  const used = trafficUsageBytes(
    server.network.monthlyReceived,
    server.network.monthlyTransmitted,
    server.trafficCalculationType,
  )
  return formatDisplayBytes(used)
}

function totalTrafficText(server: GlassServer): string {
  const used = trafficUsageBytes(
    server.network.received,
    server.network.transmitted,
    server.trafficCalculationType,
  )
  return formatDisplayBytes(used)
}

/** 列头 tooltip 用的完整说明：流量列受站点 `show_tf` 开关影响，需要交代清楚。 */
function monthlyTrafficHint(server: GlassServer): string {
  if (!server.showTraffic) return '站点已关闭流量展示'
  return `本月 ↑ ${formatDisplayBytes(server.network.monthlyTransmitted)}\n↓ ${formatDisplayBytes(server.network.monthlyReceived)}`
}

function totalTrafficHint(server: GlassServer): string {
  return `累计 ↑ ${formatDisplayBytes(server.network.transmitted)}\n↓ ${formatDisplayBytes(server.network.received)}`
}

function handleRowKeydown(event: KeyboardEvent, server: GlassServer): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('open', server)
}

function hideMissingImage(event: Event): void {
  const target = event.target
  if (target instanceof HTMLImageElement) target.style.display = 'none'
}
</script>

<template>
  <div class="node-list">
    <div class="node-list__inner">
      <div class="node-list__head" :style="gridStyle" role="row">
        <span
          v-for="column in columns"
          :key="column.key"
          class="node-list__heading"
          :class="columnAlign(column.key)"
          role="columnheader"
        >
          {{ column.label }}
        </span>
      </div>

      <div
        v-for="server in servers"
        :key="server.key"
        v-memo="[
          server,
          favoriteKeys.has(server.key),
          showSource,
          metadataEnabled,
          metadataFields,
          customTagsVisible,
          providerAliases,
          priceVisible,
        ]"
        class="node-list__row"
        :class="{ 'node-list__row--offline': !server.online }"
        role="button"
        tabindex="0"
        :aria-label="`查看节点 ${server.name} 详情`"
        @click="emit('open', server)"
        @keydown="handleRowKeydown($event, server)"
      >
        <div class="node-list__cells" :style="gridStyle">
          <div class="node-list__cell" :class="columnAlign('status')">
            <span class="node-status-wrap" aria-hidden="true">
              <span
                class="node-status"
                :class="server.online ? 'node-status--online' : 'node-status--offline'"
              />
              <span
                class="node-status-pulse"
                :class="server.online ? 'node-status-pulse--online' : 'node-status-pulse--offline'"
              />
            </span>
          </div>

          <div class="node-list__cell" :class="columnAlign('os')">
            <img
              class="node-list__os"
              :src="osIconUrl(server.operatingSystem)"
              :alt="osDisplayName(server.operatingSystem)"
              :title="server.operatingSystem ?? osDisplayName(server.operatingSystem)"
              @error="hideMissingImage"
            >
          </div>

          <div class="node-list__cell node-list__cell--name" :class="columnAlign('name')">
            <div class="node-list__identity">
              <img
                v-if="regionCode(server)"
                class="node-list__flag"
                :src="flagUrl(regionCode(server) as string)"
                :alt="server.region ?? ''"
                @error="hideMissingFlag"
              >
              <span class="node-list__name" :title="server.name">{{ server.name }}</span>
              <button
                type="button"
                class="favorite-button"
                :class="{ 'is-favorite': favoriteKeys.has(server.key) }"
                :aria-label="favoriteKeys.has(server.key) ? `取消收藏 ${server.name}` : `收藏 ${server.name}`"
                :title="favoriteKeys.has(server.key) ? '取消收藏' : '收藏节点'"
                @click.stop="emit('toggleFavorite', server.key)"
                @keydown.stop
              >
                <AppIcon :name="favoriteKeys.has(server.key) ? 'tabler:star-filled' : 'tabler:star'" :size="13" />
              </button>
            </div>
            <span v-if="priceText(server)" class="node-list__sub">{{ priceText(server) }}</span>
          </div>

          <div
            v-if="metadataEnabled"
            class="node-list__cell node-list__cell--metadata"
            :class="columnAlign('metadata')"
          >
            <span
              v-for="badge in metadataBadges(server)"
              :key="badge.key"
              class="node-list__badge"
              :title="badge.value"
            >
              <img v-if="badge.flag" :src="badge.flag" alt="" @error="hideMissingFlag">
              <span>{{ badge.value }}</span>
            </span>
          </div>

          <div class="node-list__cell" :class="columnAlign('uptime')">
            <span class="node-list__sub">{{ formatUptime(server.bootTime) }}</span>
          </div>

          <div class="node-list__cell node-list__cell--metric" :class="columnAlign('cpu')">
            <span class="node-list__metric-value">{{ formatPercent(server.cpu) }}</span>
            <!-- 上游 NodeList 的进度条同样按 `getStatus` 着色。 -->
            <AppProgressThin :percentage="server.cpu" :status="usageStatus(server.cpu)" />
          </div>

          <div class="node-list__cell node-list__cell--metric" :class="columnAlign('mem')">
            <span class="node-list__metric-value">
              {{ formatPercent(ratio(server.memory.used, server.memory.total)) }}
            </span>
            <AppProgressThin
              :percentage="ratio(server.memory.used, server.memory.total)"
              :status="usageStatus(ratio(server.memory.used, server.memory.total))"
            />
          </div>

          <div class="node-list__cell node-list__cell--metric" :class="columnAlign('disk')">
            <span class="node-list__metric-value">
              {{ formatPercent(ratio(server.disk.used, server.disk.total)) }}
            </span>
            <AppProgressThin
              :percentage="ratio(server.disk.used, server.disk.total)"
              :status="usageStatus(ratio(server.disk.used, server.disk.total))"
            />
          </div>

          <!--
            实时网速：紧跟硬盘之后，与右侧两列流量共同组成「资源 → 网络」的阅读顺序。
            上行 / 下行同时给出，用颜色区分方向，缺失的一向单独显示占位符而不写成 0。
          -->
          <div class="node-list__cell node-list__cell--speed" :class="columnAlign('rate')">
            <span class="node-list__sub node-list__sub--up" :title="`↑ 上传 ${formatDisplaySpeed(server.network.outSpeed)}`">
              ↑ {{ formatDisplaySpeed(server.network.outSpeed) }}
            </span>
            <span class="node-list__sub node-list__sub--down" :title="`↓ 下载 ${formatDisplaySpeed(server.network.inSpeed)}`">
              ↓ {{ formatDisplaySpeed(server.network.inSpeed) }}
            </span>
          </div>

          <div class="node-list__cell node-list__cell--bytes" :class="columnAlign('monthly')">
            <span class="node-list__metric-value" :title="monthlyTrafficHint(server)">
              {{ monthlyTrafficText(server) }}
            </span>
          </div>

          <div class="node-list__cell node-list__cell--bytes" :class="columnAlign('total')">
            <span class="node-list__metric-value" :title="totalTrafficHint(server)">
              {{ totalTrafficText(server) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
