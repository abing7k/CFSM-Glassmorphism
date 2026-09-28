import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ServerList from '@/components/dashboard/ServerList.vue'
import { trafficDisplay, trafficHeadText, trafficRatioText } from '@/domain/theme-presentation'
import type { GlassServer } from '@/types/glassmorphism'
import { MISSING_TEXT } from '@/utils/format'

/*
 * 节点流量显示口径（v1.1.15）。
 *
 * Komari NodeCard 没有上限时显示 `∞` 与真实的 `已用 / ∞`；此前本主题在没有上限时把已用量
 * 整个当成未知，显示 `— / ∞`。另外两种情况此前都显示「∞」，等于宣称不限流量：
 * 站点关闭流量展示（CFSM `show_tf`，上游没有这个开关）、有上限但月度计数缺失
 * （上游把缺失按 0 计）。现在前者不呈现任何数值，后者保留上限、已用量如实为未知。
 */

const GiB = 1024 ** 3

function server(overrides: Partial<GlassServer> = {}): GlassServer {
  return {
    key: 'example:node', id: 'node', sourceBase: 'https://example.invalid', sourceLabel: 'Example',
    name: 'Example Node', group: '', tags: [], region: 'HK',
    price: null, billingCycle: null, currency: null, expireDate: null, trafficLimit: null,
    trafficCalculationType: 'total', showPrice: true, showExpire: true, showTraffic: true,
    online: true, sortOrder: null, cpu: 5, load: { one: 1.11, five: 2.22, fifteen: 3.33 },
    memory: { used: null, total: null, percentage: null },
    swap: { used: null, total: null, percentage: null },
    disk: { used: null, total: null, percentage: null },
    network: {
      inSpeed: null, outSpeed: null, received: null, transmitted: null,
      monthlyReceived: 3 * GiB, monthlyTransmitted: GiB,
    },
    processes: null, tcpConnections: null, udpConnections: null, latency: [],
    history: { latencySeries: {}, packetLossSeries: {} }, gpus: [],
    connectivity: { ipv4: null, ipv6: null }, operatingSystem: null, architecture: null,
    cpuInfo: null, cpuCores: null, kernelVersion: null, agentVersion: null, bootTime: null, lastUpdated: null,
    ...overrides,
  }
}

function withMonthly(received: number | null, transmitted: number | null): Partial<GlassServer> {
  return {
    network: {
      inSpeed: null, outSpeed: null, received: null, transmitted: null,
      monthlyReceived: received, monthlyTransmitted: transmitted,
    },
  }
}

describe('节点流量显示口径', () => {
  it('不限流量时显示真实已用量 / ∞，不再把已用量当成未知', () => {
    // CFSM 自己按 `parseFloat(traffic_limit) || 0` 判断：空、0 都是不限流量。
    for (const trafficLimit of [null, '', '0', '0.0']) {
      const view = trafficDisplay(server({ trafficLimit }))
      expect(view).toEqual({ kind: 'unlimited', used: 4 * GiB })
      expect(trafficHeadText(view)).toBe('∞')
      expect(trafficRatioText(view)).toBe('4.0 GB / ∞')
    }
  })

  it('已用量沿用 CFSM 的计费方式', () => {
    expect(trafficDisplay(server({ trafficCalculationType: 'dl' }))).toMatchObject({ used: 3 * GiB })
    expect(trafficDisplay(server({ trafficCalculationType: 'ul' }))).toMatchObject({ used: GiB })
    expect(trafficDisplay(server({ trafficCalculationType: 'max' }))).toMatchObject({ used: 3 * GiB })
    expect(trafficDisplay(server({ trafficCalculationType: 'total' }))).toMatchObject({ used: 4 * GiB })
  })

  it('有上限时显示百分比与「已用 / 上限」', () => {
    const view = trafficDisplay(server({ trafficLimit: '550.0' }))
    expect(view).toMatchObject({ kind: 'limited', used: 4 * GiB, limit: 550 * GiB })
    expect(trafficHeadText(view)).toBe('0.7%')
    expect(trafficRatioText(view)).toBe('4.0 GB / 550.0 GB')
  })

  it('有上限但月度计数缺失时保留上限，已用量如实为未知，不写成 0 也不冒充不限流量', () => {
    const view = trafficDisplay(server({ trafficLimit: '550.0', ...withMonthly(null, GiB) }))
    expect(view).toEqual({ kind: 'limited', used: null, limit: 550 * GiB, percent: null })
    expect(trafficHeadText(view)).toBe('-')
    expect(trafficRatioText(view)).toBe('- / 550.0 GB')
  })

  it('不限流量但月度计数缺失时只有已用量未知', () => {
    const view = trafficDisplay(server(withMonthly(3 * GiB, null)))
    expect(view).toEqual({ kind: 'unlimited', used: null })
    expect(trafficHeadText(view)).toBe('∞')
    expect(trafficRatioText(view)).toBe('- / ∞')
  })

  it('站点关闭流量展示时不透露任何数值，也不写成「∞」', () => {
    const view = trafficDisplay(server({ showTraffic: false, trafficLimit: '550.0' }))
    expect(view).toEqual({ kind: 'hidden' })
    expect(trafficHeadText(view)).toBe('-')
    expect(trafficRatioText(view)).toBe('- / -')
  })

  it('占位符与 Komari 一致是 ASCII 短横', () => {
    expect(MISSING_TEXT).toBe('-')
  })
})

async function listValues(overrides: Partial<GlassServer>): Promise<string[]> {
  const html = await renderToString(createSSRApp(ServerList, {
    servers: [server(overrides)], showSource: false, favoriteKeys: new Set<string>(),
    metadataEnabled: false, metadataFields: [], customTagsVisible: false, providerAliases: [], priceVisible: true,
  }))
  // 两列流量带 title（完整值的 tooltip），因此匹配时允许 class 之后还有其它属性。
  const values = [...html.matchAll(/<span class="node-list__metric-value"[^>]*>([^<]*)<\/span>/g)].map((item) => item[1]?.trim() ?? '')
  // CPU / 内存 / 硬盘 / 本月流量 / 总流量
  expect(values).toHaveLength(5)
  return values
}

async function listMonthlyTraffic(overrides: Partial<GlassServer>): Promise<string> {
  return (await listValues(overrides))[3] ?? ''
}

async function listTotalTraffic(overrides: Partial<GlassServer>): Promise<string> {
  return (await listValues(overrides))[4] ?? ''
}

describe('节点列表的流量格', () => {
  /*
   * 列表改成「本月流量 / 总流量」两列后，两列都直接呈现真实字节数，
   * 不再复用旧的百分比口径；缺失时统一给占位符。
   * 方格（卡片）视图已移除，因此这里只覆盖列表。
   */
  it('列表：本月流量读月度计数，总流量读网卡累计计数', async () => {
    // 默认 fixture 只有月度计数（3 GiB 下行 + 1 GiB 上行）。
    expect(await listMonthlyTraffic({})).toBe('4.0 GB')
    expect(await listMonthlyTraffic({ ...withMonthly(null, null) })).toBe('-')
    // 总流量读网卡累计计数，与月度计数、站点流量开关都无关。
    const cumulative = {
      network: {
        inSpeed: null, outSpeed: null, received: 3 * GiB, transmitted: GiB,
        monthlyReceived: null, monthlyTransmitted: null,
      },
    }
    expect(await listTotalTraffic(cumulative)).toBe('4.0 GB')
    expect(await listTotalTraffic({ ...cumulative, showTraffic: false })).toBe('4.0 GB')
  })
})
